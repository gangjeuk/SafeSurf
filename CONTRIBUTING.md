# About developing the application

Please see README.md

## Basic rules

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) to standardize the commit messages.

### Pre-commit Hooks

We use [Husky](https://typicode.github.io/husky/#/) and [lint-staged](https://github.com/okonet/lint-staged) to enforce the pre-commit hooks.

## Submitting Changes

### Version control

We use [changeset](https://github.com/changesets/changesets) to control `package.json` version and leave `CHANGELOG.md` message.

### While developing

- Fork this repository to your repository
- Develope some parts of the project
- Leave commit messages
- Once the function is fully developed do `pnpm changeset` for leave minor log for the changes

### Submitting process

- `pnpm changeset version` to specify the changelogs for the packages you want to publish
- Push your changes to a feature branch in your fork of the repository.
- Submit a pull request to this repository
