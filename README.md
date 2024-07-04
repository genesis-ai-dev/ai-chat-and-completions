# Translator's Copilot

Translator's Copilot is a Codex extension designed to assist with Bible translation tasks. It provides AI-powered inline completions and contextual information to aid translators in their work.

## Features

- AI-assisted inline completions for Bible verses
- Currated for translating into low-resource languages
- Integration with project-specific resources and parallel passages
- Side panel for additional information and interactions (not yet developed)

## Installation

1. Open Codex
2. Go to the Extensions view (Ctrl+Shift+X)
3. Search for "Translator's Copilot"
4. Click Install

## Configuration

Configure the extension in your VS Code settings:

Must be configured:
- `translators-copilot.required.api_key`: Your API key (required for OpenAI (which is currently the only supported API))

May be configured:
- `translators-copilot.general.sourceTextSelectionMode`: Method of selecting source text ("auto" or "manual")
- `translators-copilot.general.contextSize`: Size of context for completion ("small", "medium", or "large")
- `translators-copilot.general.additionalResourcesDirectory`: Directory path for additional resources

It is recommended not to configure:
- `translators-copilot.defaultsRecommended.llmEndpoint`: API endpoint for completions
- `translators-copilot.defaultsRecommended.model`: Language model to use
- `translators-copilot.defaultsRecommended.sourceBookWhitelist`: Limit context building to specified books
- `translators-copilot.defaultsRecommended.experimentalContextOmission`: Option to omit Bible references in API requests

## Usage

1. Open a translation project in VS Code
2. Place your cursor at the end of a verse you're working on
3. Use the keyboard shortcut (Alt+Q) or right-click menu to trigger an inline completion
4. Accept or modify the suggested completion as needed

For manual source text selection:
- Use the keyboard shortcut Ctrl+S, Ctrl+B (Cmd+S, Cmd+B on Mac) when the source text selection mode is set to "manual"

## Requirements

- Visual Studio Code 1.85.0 or higher OR VScodium 1.85.0 or higher OR the Codex app
- basic Codex extensions (Codex Editor along with the extensions it automatically downloads)
- An active internet connection for API access (unless using a local LLM)
- Properly structured translation project (Use the Codex Project Manager extension to set this up)

## Additional Features

- Keybind (alt + q) and CodeLens support for easy completion triggering
- Integration with eBible corpus for source text management
- Ability to use additional resources for translation assistance

## License

This project is licensed under the MIT License - see the LICENSE file for details.