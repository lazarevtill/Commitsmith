// SPDX-License-Identifier: Apache-2.0
import * as vscode from "vscode";

/** Minimal slice of the built-in `vscode.git` extension API that we use. */
export interface GitInputBox {
  value: string;
}

export interface GitRepository {
  rootUri: vscode.Uri;
  inputBox: GitInputBox;
}

export interface GitAPI {
  repositories: GitRepository[];
}

interface GitExtensionExports {
  getAPI(version: 1): GitAPI;
}

/** Activate and return the built-in Git extension API, or undefined if unavailable. */
export async function getGitApi(): Promise<GitAPI | undefined> {
  const ext = vscode.extensions.getExtension<GitExtensionExports>("vscode.git");
  if (!ext) {
    return undefined;
  }
  if (!ext.isActive) {
    await ext.activate();
  }
  return ext.exports.getAPI(1);
}

/**
 * Choose which repository to act on. Prefers an explicit SCM argument (from the
 * Source Control title button), then the repo containing the active editor, then
 * the only repo, then the first.
 */
export function pickRepository(api: GitAPI, arg?: unknown): GitRepository | undefined {
  const repos = api.repositories;
  if (repos.length === 0) {
    return undefined;
  }

  const argUri = (arg as { rootUri?: vscode.Uri } | undefined)?.rootUri;
  if (argUri) {
    const match = repos.find((r) => r.rootUri.toString() === argUri.toString());
    if (match) {
      return match;
    }
  }

  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    const containing = repos
      .filter((r) => activeUri.fsPath.startsWith(r.rootUri.fsPath))
      .sort((a, b) => b.rootUri.fsPath.length - a.rootUri.fsPath.length)[0];
    if (containing) {
      return containing;
    }
  }

  return repos[0];
}
