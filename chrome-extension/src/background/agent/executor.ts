import {
  ChatModelAuthError,
  ChatModelBadRequestError,
  ChatModelForbiddenError,
  ExtensionConflictError,
  RequestCancelledError,
  MaxStepsReachedError,
  MaxFailuresReachedError,
} from './agents/errors';
import { agentStateSchema, createNaviageAgent } from './agents/navigator';
import { createPlannerAgent, createReplannerAgent } from './agents/planner';
import { createSearcherAgent } from './agents/searcher';
import { EventManager } from './event/manager';
import { Actors, EventType, ExecutionState } from './event/types';
import MessageManager from './messages/service';
import { NavigatorPrompt } from './prompts/navigator';
import { plannerPrompt, replannerPrompt } from './prompts/planner';
import { createRanker } from './runner/ranker';
import { createSummarizer } from './runner/summarizer';
import { AgentContext } from './types';
import { URLNotAllowedError } from '../browser/views';
import { analytics } from '../services/analytics';
import { t } from '@extension/i18n';
import { chatHistoryStore } from '@extension/storage/lib/chat';
import { StateGraph, START, END } from '@langchain/langgraph/web';
import { registry } from '@langchain/langgraph/zod';
import { createLogger } from '@src/background/log';
import { HumanMessage, SystemMessage } from 'langchain';
import { z } from 'zod';
import type { PlannerOutput } from './agents/planner';
import type { EventCallback } from './event/types';
import type { AgentStepHistory } from './history';
import type BrowserContext from '../browser/context';
import type { BaseSearchResponse } from './tools/search/google';
import type { ActionResult, AgentOptions, AgentOutput } from './types';
import type { GeneralSettingsConfig } from '@extension/storage';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Runtime } from 'langchain';

const logger = createLogger('Executor');

export interface ExecutorExtraArgs {
  plannerLLM?: BaseChatModel;
  extractorLLM?: BaseChatModel;
  agentOptions?: Partial<AgentOptions>;
  generalSettings?: GeneralSettingsConfig;
}

export function getExecutor() {}

export class Executor {
  // private readonly navigator: NavigatorAgent;
  // private readonly planner: PlannerAgent;
  public readonly naviagtorAgent: ReturnType<typeof createNaviageAgent>; // ReactAgent
  public readonly plannerAgent: ReturnType<typeof createPlannerAgent>;
  public readonly replannerAgent: ReturnType<typeof createReplannerAgent>;
  public readonly searcher: ReturnType<typeof createSearcherAgent>;
  public readonly ranker: ReturnType<typeof createRanker>;
  public readonly summarizer: ReturnType<typeof createSummarizer>;
  public readonly context: AgentContext;
  public readonly app: ReturnType<typeof compileGraph>; // CompiledStateGraph
  public readonly plannerPrompt = plannerPrompt;
  public readonly replannerPrompt = replannerPrompt;
  private readonly navigatorPrompt: NavigatorPrompt;
  private readonly generalSettings: GeneralSettingsConfig | undefined;
  private tasks: string[] = [];
  constructor(
    task: string,
    taskId: string,
    browserContext: BrowserContext,
    navigatorLLM: BaseChatModel,
    extraArgs?: Partial<ExecutorExtraArgs>,
  ) {
    const messageManager = new MessageManager();

    const plannerLLM = extraArgs?.plannerLLM ?? navigatorLLM;
    // const extractorLLM = extraArgs?.extractorLLM ?? navigatorLLM;
    const eventManager = new EventManager();
    const context = new AgentContext(
      taskId,
      browserContext,
      messageManager,
      eventManager,
      extraArgs?.agentOptions ?? {},
    );

    this.generalSettings = extraArgs?.generalSettings;
    this.tasks.push(task);
    this.navigatorPrompt = new NavigatorPrompt(context.options.maxActionsPerStep);

    // const actionBuilder = new ActionBuilder(context, extractorLLM);
    // const navigatorActionRegistry = new NavigatorActionRegistry(actionBuilder.buildDefaultActions());

    // // Initialize agents with their respective prompts
    // this.navigator = new NavigatorAgent(navigatorActionRegistry, {
    //   chatLLM: navigatorLLM,
    //   context: context,
    //   prompt: this.navigatorPrompt,
    // });

    // this.planner = new PlannerAgent({
    //   chatLLM: plannerLLM,
    //   context: context,
    //   prompt: this.plannerPrompt,
    // });

    this.naviagtorAgent = createNaviageAgent(navigatorLLM);
    this.plannerAgent = createPlannerAgent(plannerLLM);
    this.replannerAgent = createReplannerAgent(plannerLLM);
    this.searcher = createSearcherAgent(plannerLLM);
    this.ranker = createRanker(navigatorLLM);
    this.summarizer = createSummarizer(plannerLLM);

    this.context = context;
    this.app = compileGraph();
    // Initialize message history
    this.context.messageManager.initTaskMessages(this.navigatorPrompt.getSystemMessage(), task);
  }

  subscribeExecutionEvents(callback: EventCallback): void {
    this.context.eventManager.subscribe(EventType.EXECUTION, callback);
  }

  clearExecutionEvents(): void {
    // Clear all execution event listeners
    this.context.eventManager.clearSubscribers(EventType.EXECUTION);
  }

  addFollowUpTask(task: string): void {
    this.tasks.push(task);
    this.context.messageManager.addNewTask(task);

    // need to reset previous action results that are not included in memory
    this.context.actionResults = this.context.actionResults.filter(result => result.includeInMemory);
  }

  /**
   * Check if task is complete based on planner output and handle completion
   */
  private checkTaskCompletion(planOutput: AgentOutput<PlannerOutput> | null): boolean {
    if (planOutput?.result?.done) {
      logger.info('✅ Planner confirms task completion');
      if (planOutput.result.final_answer) {
        this.context.finalAnswer = planOutput.result.final_answer;
      }
      return true;
    }
    return false;
  }

  /**
   * Execute the task
   *
   * @returns {Promise<void>}
   */
  async execute(): Promise<void> {
    logger.info(`🚀 Executing task: ${this.tasks[this.tasks.length - 1]}`);
    // reset the step counter
    const context = this.context;
    context.nSteps = 0;
    const allowedMaxSteps = this.context.options.maxSteps;

    try {
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_START, this.context.taskId);

      // Track task start
      void analytics.trackTaskStart(this.context.taskId);

      let step = 0;
      let latestPlanOutput: AgentOutput<PlannerOutput> | null = null;
      let navigatorDone = false;

      this.app.invoke({ input: this.tasks[0] }, { context: { executor: this } });
      return;
      for (step = 0; step < allowedMaxSteps; step++) {
        context.stepInfo = {
          stepNumber: context.nSteps,
          maxSteps: context.options.maxSteps,
        };

        logger.info(`🔄 Step ${step + 1} / ${allowedMaxSteps}`);
        if (await this.shouldStop()) {
          break;
        }

        // Run planner periodically for guidance
        if (this.planner && (context.nSteps % context.options.planningInterval === 0 || navigatorDone)) {
          navigatorDone = false;
          latestPlanOutput = await this.runPlanner();

          // Check if task is complete after planner run
          if (this.checkTaskCompletion(latestPlanOutput)) {
            break;
          }
        }

        // Execute navigator
        navigatorDone = await this.navigate();

        // If navigator indicates completion, the next periodic planner run will validate it
        if (navigatorDone) {
          logger.info('🔄 Navigator indicates completion - will be validated by next planner run');
        }
      }

      // Determine task completion status
      const isCompleted = latestPlanOutput?.result?.done === true;

      if (isCompleted) {
        // Emit final answer if available, otherwise use task ID
        const finalMessage = this.context.finalAnswer || this.context.taskId;
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_OK, finalMessage);

        // Track task completion
        void analytics.trackTaskComplete(this.context.taskId);
      } else if (step >= allowedMaxSteps) {
        logger.error('❌ Task failed: Max steps reached');
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_FAIL, t('exec_errors_maxStepsReached'));

        // Track task failure with specific error category
        const maxStepsError = new MaxStepsReachedError(t('exec_errors_maxStepsReached'));
        const errorCategory = analytics.categorizeError(maxStepsError);
        void analytics.trackTaskFailed(this.context.taskId, errorCategory);
      } else if (this.context.stopped) {
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_CANCEL, t('exec_task_cancel'));

        // Track task cancellation
        void analytics.trackTaskCancelled(this.context.taskId);
      } else {
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_PAUSE, t('exec_task_pause'));
        // Note: We don't track pause as it's not a final state
      }
    } catch (error) {
      if (error instanceof RequestCancelledError) {
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_CANCEL, t('exec_task_cancel'));

        // Track task cancellation
        void analytics.trackTaskCancelled(this.context.taskId);
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_FAIL, t('exec_task_fail', [errorMessage]));

        // Track task failure with detailed error categorization
        const errorCategory = analytics.categorizeError(error instanceof Error ? error : errorMessage);
        void analytics.trackTaskFailed(this.context.taskId, errorCategory);
      }
    } finally {
      if (import.meta.env.DEV) {
        logger.debug('Executor history', JSON.stringify(this.context.history, null, 2));
      }
      // store the history only if replay is enabled
      if (this.generalSettings?.replayHistoricalTasks) {
        const historyString = JSON.stringify(this.context.history);
        logger.info(`Executor history size: ${historyString.length}`);
        await chatHistoryStore.storeAgentStepHistory(this.context.taskId, this.tasks[0], historyString);
      } else {
        logger.info('Replay historical tasks is disabled, skipping history storage');
      }
    }
  }

  /**
   * Helper method to run planner and store its output
   * @deprecated
   */
  private async runPlanner(): Promise<AgentOutput<PlannerOutput> | null> {
    const context = this.context;
    try {
      // Add current browser state to memory
      let positionForPlan = 0;
      if (this.tasks.length > 1 || this.context.nSteps > 0) {
        await this.navigator.addStateMessageToMemory();
        positionForPlan = this.context.messageManager.length() - 1;
      } else {
        positionForPlan = this.context.messageManager.length();
      }

      // Execute planner
      const planOutput = await this.planner.execute();
      if (planOutput.result) {
        this.context.messageManager.addPlan(JSON.stringify(planOutput.result), positionForPlan);
      }
      return planOutput;
    } catch (error) {
      logger.error(`Failed to execute planner: ${error}`);
      if (
        error instanceof ChatModelAuthError ||
        error instanceof ChatModelBadRequestError ||
        error instanceof ChatModelForbiddenError ||
        error instanceof URLNotAllowedError ||
        error instanceof RequestCancelledError ||
        error instanceof ExtensionConflictError
      ) {
        throw error;
      }
      context.consecutiveFailures++;
      logger.error(`Failed to execute planner: ${error}`);
      if (context.consecutiveFailures >= context.options.maxFailures) {
        throw new MaxFailuresReachedError(t('exec_errors_maxFailuresReached'));
      }
      return null;
    }
  }

  async cancel(): Promise<void> {
    this.context.stop();
  }

  async resume(): Promise<void> {
    this.context.resume();
  }

  async pause(): Promise<void> {
    this.context.pause();
  }

  async cleanup(): Promise<void> {
    try {
      await this.context.browserContext.cleanup();
    } catch (error) {
      logger.error(`Failed to cleanup browser context: ${error}`);
    }
  }

  async getCurrentTaskId(): Promise<string> {
    return this.context.taskId;
  }

  /**
   * Replays a saved history of actions with error handling and retry logic.
   *
   * @param history - The history to replay
   * @param maxRetries - Maximum number of retries per action
   * @param skipFailures - Whether to skip failed actions or stop execution
   * @param delayBetweenActions - Delay between actions in seconds
   * @returns List of action results
   * @deprecated
   */
  async replayHistory(
    sessionId: string,
    maxRetries = 3,
    skipFailures = true,
    delayBetweenActions = 2.0,
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];
    const replayLogger = createLogger('Executor:replayHistory');

    logger.info('replay task', this.tasks[0]);

    try {
      const historyFromStorage = await chatHistoryStore.loadAgentStepHistory(sessionId);
      if (!historyFromStorage) {
        throw new Error(t('exec_replay_historyNotFound'));
      }

      const history = JSON.parse(historyFromStorage.history) as AgentStepHistory;
      if (history.history.length === 0) {
        throw new Error(t('exec_replay_historyEmpty'));
      }
      logger.debug(`🔄 Replaying history: ${JSON.stringify(history, null, 2)}`);
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_START, this.context.taskId);

      for (let i = 0; i < history.history.length; i++) {
        const historyItem = history.history[i];

        // Check if execution should stop
        if (this.context.stopped) {
          replayLogger.info('Replay stopped by user');
          break;
        }

        // Execute the history step with enhanced method that handles all the logic
        const stepResults = await this.navigator.executeHistoryStep(
          historyItem,
          i,
          history.history.length,
          maxRetries,
          delayBetweenActions * 1000,
          skipFailures,
        );

        results.push(...stepResults);

        // If stopped during execution, break the loop
        if (this.context.stopped) {
          break;
        }
      }

      if (this.context.stopped) {
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_CANCEL, t('exec_replay_cancel'));
      } else {
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_OK, t('exec_replay_ok'));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      replayLogger.error(`Replay failed: ${errorMessage}`);
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_FAIL, t('exec_replay_fail', [errorMessage]));
    }

    return results;
  }
}

// =============== BEGIN graph state, context ==================
const ExecutorState = z.object({
  input: z.string().register(registry, {
    reducer: {
      fn: (x, y) => y ?? x ?? '',
    },
  }),
  plan: z.array(z.string()).register(registry, {
    reducer: {
      fn: (x, y) => y ?? x ?? [],
    },
  }),
  pastSteps: z.array(z.tuple([z.string(), z.string()])).register(registry, {
    reducer: {
      fn: (x, y) => x.concat(y),
    },
  }),
  response: z.string().register(registry, {
    reducer: {
      fn: (x, y) => y ?? x,
    },
  }),
});

const ExecutorContext = z.object({
  executor: z.instanceof(Executor),
  agentState: agentStateSchema,
});

// =============== END graph state, context ==================

// =============== BEGIN graph Node ==================

async function executeStep(
  state: z.infer<typeof ExecutorState>,
  runtime: Runtime<z.infer<typeof ExecutorContext> | undefined>,
) {
  if (runtime?.context === undefined) {
    throw new Error('Executor context not initialized');
  }
  const task = state.plan[0];
  const context = runtime.context.executor.context;
  logger.info(state);

  const { messages } = await runtime.context.executor.naviagtorAgent.invoke(
    {
      messages: [new HumanMessage(task)],
      ...runtime.context.agentState,
    },
    {
      // ...runtime,
      context: {
        taskId: context.taskId,
        eventContext: context.eventManager,
        browserContext: context.browserContext,
      },
    },
  );

  for (const msg of messages) {
    // When ToolMessage made by GoogleSearch tool
    logger.info(msg);
    if (msg.name === 'google_search') {
      const content: BaseSearchResponse = JSON.parse(msg.content as string);
      const ranker = runtime.context.executor.ranker;

      const rank = await ranker.invoke({
        messages: [
          new SystemMessage(`For the given objective, rank the importance of information. 
Your objective was this:
${state.input}

Query string used for google search is this:
${content.query}

Your original plan was this:
${state.plan[0]}

You have currently done the follow steps:
${messages[messages.length - 1].content.toString()}

Return top 4 results from the input data, and score the importance of each result from 0 to 10. Higher means more important`),
          new HumanMessage([{ type: 'text', text: JSON.stringify(content.results) }]),
        ],
      });

      logger.info(rank);

      for (const res of rank.structuredResponse) {
        const _tmp = content.results.at(res.index);
        if (_tmp !== undefined) {
          _tmp.score = res.score;
          _tmp.raw_content = await (await fetch(_tmp.url)).text();
        }
      }
    }
  }

  logger.info(messages);
  return {
    pastSteps: [[task, messages[messages.length - 1].content.toString()]],
    plan: state.plan.slice(1),
  };
}

async function planStep(
  state: z.infer<typeof ExecutorState>,
  runtime: Runtime<z.infer<typeof ExecutorContext> | undefined>,
) {
  if (runtime?.context === undefined) {
    throw new Error('Executor context not initialized');
  }
  const executor = runtime.context.executor;

  const prompt = await executor.plannerPrompt.format({ objective: state.input });
  const plan = await executor.plannerAgent.invoke({
    messages: [{ role: 'system', content: prompt }],
    ...runtime.context.agentState,
  });
  logger.info(plan);

  return { plan: [plan.structuredResponse.steps] };
}

async function replanStep(
  state: z.infer<typeof ExecutorState>,
  runtime: Runtime<z.infer<typeof ExecutorContext> | undefined>,
) {
  if (runtime?.context === undefined) {
    throw new Error('Executor context not initialized');
  }

  const executor = runtime.context.executor;
  const prompt = await executor.replannerPrompt.format({
    input: state.input,
    plan: state.plan.join('\n'),
    pastSteps: state.pastSteps.map(([step, result]) => `${step}: ${result}`).join('\n'),
  });
  const output = await runtime.context.executor.replannerAgent.invoke({
    messages: [{ role: 'system', content: prompt }],
    ...runtime.context.agentState,
  });
  const toolCall = output;
  logger.info(output);

  if (toolCall.structuredResponse.done) {
    return { response: toolCall.structuredResponse.final_answer };
  }

  return { plan: [toolCall.structuredResponse.next_steps] };
}

function shouldEnd(state: z.infer<typeof ExecutorState>) {
  return state.response ? 'true' : 'false';
}

// =============== END graph Node ==================

function compileGraph() {
  const workflow = new StateGraph(ExecutorState, { context: ExecutorContext })
    .addNode('planner', planStep)
    .addNode('agent', executeStep)
    .addNode('replan', replanStep)
    .addEdge(START, 'planner')
    .addEdge('planner', 'agent')
    .addEdge('agent', 'replan')
    .addConditionalEdges('replan', shouldEnd, {
      true: END,
      false: 'agent',
    });

  const app = workflow.compile();
  return app;
}
