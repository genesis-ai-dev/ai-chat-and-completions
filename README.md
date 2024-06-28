# Translator's Copilot

Translator's Copilot is a Codex extension designed to assist with Bible translation tasks. It provides AI-powered inline completions and contextual information to aid translators in their work.

## Features

- AI-assisted inline completions for Bible verses
- Integration with project-specific resources and parallel passages
- Side panel for additional information and interactions
- Customizable completion modes (only verse completion is currently implemented)
  

## Installation

1. Open Visual Studio Code
2. Go to the Extensions view (Ctrl+Shift+X)
3. Search for "translators-copilot"
4. Click Install

## Configuration

Configure the extension in your VS Code settings:

- `translators-copilot.llmEndpoint`: API endpoint for completions (default: OpenAI)
- `translators-copilot.api_key`: Your API key (required for OpenAI)
- `translators-copilot.model`: Language model to use (e.g., "gpt-3.5-turbo")
- `translators-copilot.max_tokens`: Maximum tokens for completions
- `translators-copilot.temperature`: Randomness of completions (0.0 - 1.0)
- `translators-copilot.sourceTextFile`: Source text file name
- `translators-copilot.additionalResourcesDirectory`: Directory for additional resources
- `translators-copilot.completionMode`: Completion mode (verse, chapter, token)

## Usage

1. Open a Codex translation project
2. Place your cursor at the end of a verse you're working on
3. Use the keyboard shortcut (Alt+Q) or command palette to trigger an inline completion
4. Accept or modify the suggested completion as needed

## Requirements

- Visual Studio Code 1.85.0 or higher
- An active internet connection for API access
- Properly structured Codex project

## License

This project is licensed under the MIT License License - see the LICENSE file for details.
