// SPDX-License-Identifier: Apache-2.0
import * as vscode from "vscode";
import { API_KEY_SECRET, needsApiKey, resolveConfig } from "./config";
import { collectChanges } from "./git";
import { getGitApi, pickRepository, type GitRepository } from "./git-api";
import { generateMessage } from "./pipeline";
import { ProviderError } from "./provider";
import type { DiffSelection, FileChange } from "./types";

/** Human-readable message from an unknown thrown value. */
function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("commitsmith.generate", (arg?: unknown) =>
      generate(context, arg),
    ),
    vscode.commands.registerCommand("commitsmith.setApiKey", () => setApiKey(context)),
    vscode.commands.registerCommand("commitsmith.clearApiKey", () => clearApiKey(context)),
    vscode.commands.registerCommand("commitsmith.selectProvider", () => selectProvider()),
  );
}

export function deactivate(): void {
  // no-op
}

async function generate(context: vscode.ExtensionContext, arg?: unknown): Promise<void> {
  const api = await getGitApi();
  if (!api) {
    void vscode.window.showErrorMessage(
      "Commitsmith: the built-in Git extension is not available.",
    );
    return;
  }

  const repo = pickRepository(api, arg);
  if (!repo) {
    void vscode.window.showErrorMessage("Commitsmith: no Git repository found.");
    return;
  }

  let files: FileChange[];
  let selection: DiffSelection;
  try {
    ({ files, selection } = collectChanges(repo.rootUri.fsPath));
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Commitsmith: failed to read git diff. ${describeError(err)}`,
    );
    return;
  }

  if (selection === "none" || files.length === 0) {
    void vscode.window.showInformationMessage(
      "Commitsmith: nothing staged or changed to generate a message from.",
    );
    return;
  }

  const config = await resolveConfig(context);

  if (!config.model) {
    void vscode.window.showErrorMessage("Commitsmith: no model configured (commitsmith.model).");
    return;
  }
  if (!config.apiKey && needsApiKey(config.api, config.baseUrl)) {
    const choice = await vscode.window.showErrorMessage(
      "Commitsmith: no API key set for a remote OpenAI-compatible endpoint. " +
        "If you meant to use a local Ollama server, switch the provider instead.",
      "Set API Key",
      "Use Ollama",
    );
    if (choice === "Set API Key") {
      await setApiKey(context);
    } else if (choice === "Use Ollama") {
      await setProvider("ollama");
    }
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.SourceControl, title: "Generating commit message…" },
    async () => {
      try {
        const result = await generateMessage(files, config);
        if (!result.message) {
          void vscode.window.showWarningMessage("Commitsmith: the model returned an empty message.");
          return;
        }
        writeToInputBox(repo, result.message);
        if (result.strategy === "two-pass") {
          void vscode.window.setStatusBarMessage(
            "Commitsmith: large diff summarized in two passes.",
            4000,
          );
        } else if (result.truncated) {
          void vscode.window.setStatusBarMessage(
            "Commitsmith: diff was truncated to fit the token budget.",
            4000,
          );
        }
      } catch (err) {
        handleError(context, err);
      }
    },
  );
}

function writeToInputBox(repo: GitRepository, message: string): void {
  repo.inputBox.value = message;
}

function handleError(context: vscode.ExtensionContext, err: unknown): void {
  if (err instanceof ProviderError && err.status === 401) {
    void vscode.window
      .showErrorMessage("Commitsmith: authentication failed (401).", "Set API Key")
      .then((choice) => {
        if (choice === "Set API Key") {
          void setApiKey(context);
        }
      });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  void vscode.window.showErrorMessage(`Commitsmith: ${message}`);
}

async function setApiKey(context: vscode.ExtensionContext): Promise<void> {
  const value = await vscode.window.showInputBox({
    title: "Commitsmith: Set API Key",
    prompt: "API key for your OpenAI-compatible endpoint (stored securely; not needed for local Ollama).",
    password: true,
    ignoreFocusOut: true,
  });
  if (value === undefined) {
    return;
  }
  if (value.trim().length === 0) {
    await context.secrets.delete(API_KEY_SECRET);
    void vscode.window.showInformationMessage("Commitsmith: API key cleared.");
    return;
  }
  await context.secrets.store(API_KEY_SECRET, value.trim());
  void vscode.window.showInformationMessage("Commitsmith: API key saved.");
}

async function clearApiKey(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(API_KEY_SECRET);
  void vscode.window.showInformationMessage("Commitsmith: API key cleared.");
}

/** Dropdown to choose the API provider. Ollama needs no API key. */
async function selectProvider(): Promise<void> {
  const current = vscode.workspace.getConfiguration("commitsmith").get<string>("api", "openai");
  const items: (vscode.QuickPickItem & { value: "openai" | "ollama" })[] = [
    {
      value: "ollama",
      label: "Ollama",
      description: current === "ollama" ? "current" : undefined,
      detail: "Local Ollama server — no API key required. Calls {baseUrl}/api/chat.",
    },
    {
      value: "openai",
      label: "OpenAI-compatible",
      description: current === "openai" ? "current" : undefined,
      detail: "OpenAI, OpenRouter, LM Studio, Open WebUI. Calls {baseUrl}/chat/completions.",
    },
  ];
  const pick = await vscode.window.showQuickPick(items, {
    title: "Commitsmith: Select API Provider",
    placeHolder: "Choose how commit messages are generated",
  });
  if (!pick) {
    return;
  }
  await setProvider(pick.value);
}

/** Persist the chosen provider and confirm to the user. */
async function setProvider(api: "openai" | "ollama"): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("commitsmith");
  const target = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  await cfg.update("api", api, target);
  if (api === "ollama") {
    void vscode.window.showInformationMessage(
      "Commitsmith: provider set to Ollama (no API key needed). " +
        "Set commitsmith.baseUrl to your Ollama host, e.g. http://localhost:11434.",
    );
  } else {
    void vscode.window.showInformationMessage(
      "Commitsmith: provider set to OpenAI-compatible. Set an API key if your endpoint is remote.",
    );
  }
}
