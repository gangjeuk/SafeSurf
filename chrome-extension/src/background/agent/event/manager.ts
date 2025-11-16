import { AgentEvent } from './types';
import { createLogger } from '../../log';
import type { EventType, EventCallback, ExecutionState, Actors } from './types';
import type { agentContextSchema, agentStateSchema } from '../types';
import type { z } from 'zod';

const logger = createLogger('event-manager');

export class EventManager {
  private _subscribers: Map<EventType, EventCallback[]>;

  constructor() {
    this._subscribers = new Map();
  }

  subscribe(eventType: EventType, callback: EventCallback): void {
    if (!this._subscribers.has(eventType)) {
      this._subscribers.set(eventType, []);
    }

    const callbacks = this._subscribers.get(eventType);
    if (callbacks && !callbacks.includes(callback)) {
      callbacks.push(callback);
    }
  }

  unsubscribe(eventType: EventType, callback: EventCallback): void {
    if (this._subscribers.has(eventType)) {
      const callbacks = this._subscribers.get(eventType);
      if (callbacks) {
        this._subscribers.set(
          eventType,
          callbacks.filter(cb => cb !== callback),
        );
      }
    }
  }

  clearSubscribers(eventType: EventType): void {
    if (this._subscribers.has(eventType)) {
      this._subscribers.set(eventType, []);
    }
  }

  async emitAgentEvent(
    actor: Actors,
    executionState: ExecutionState,
    details: string,
    context: z.infer<typeof agentContextSchema>,
    state: z.infer<typeof agentStateSchema>,
  ) {
    const event = new AgentEvent(actor, executionState, {
      taskId: context.taskId,
      step: state.nSteps,
      maxSteps: context.maxSteps,
      details: details,
    });

    this.emit(event);
  }

  async emit(event: AgentEvent): Promise<void> {
    const callbacks = this._subscribers.get(event.type);
    if (callbacks) {
      try {
        await Promise.all(callbacks.map(async callback => await callback(event)));
      } catch (error) {
        logger.error('Error executing event callbacks:', error);
      }
    }
  }
}
