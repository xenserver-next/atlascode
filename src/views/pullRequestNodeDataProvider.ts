import * as vscode from 'vscode';
import { BaseNode } from './nodes/baseNode';
import { BitbucketContext } from '../bitbucket/context';
import { GitContentProvider } from './gitContentProvider';
import { PaginatedPullRequests } from '../bitbucket/model';
import { RepositoriesNode } from './nodes/repositoriesNode';
import { getPRDocumentCommentProvider } from './pullRequestCommentProvider';

export class PullRequestNodeDataProvider implements vscode.TreeDataProvider<BaseNode>, vscode.Disposable {
    private _onDidChangeTreeData: vscode.EventEmitter<BaseNode | undefined> = new vscode.EventEmitter<BaseNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<BaseNode | undefined> = this._onDidChangeTreeData.event;
    private _childrenMap: Map<string, RepositoriesNode> | undefined = undefined;

    static SCHEME = 'atlascode.bbpr';
    private _disposables: vscode.Disposable[] = [];

    constructor(private ctx: BitbucketContext) {
        this._disposables.push(vscode.workspace.registerTextDocumentContentProvider(PullRequestNodeDataProvider.SCHEME, new GitContentProvider(ctx)));
        this._disposables.push(vscode.workspace.registerDocumentCommentProvider(getPRDocumentCommentProvider()));
        ctx.onDidChangeBitbucketContext(() => {
            this.updateChildren();
            this.refresh();
        });
        getPRDocumentCommentProvider().onDidChangeCommentThreads(() => {
            this.refresh();
        });
    }

    private updateChildren(): void {
        if (!this._childrenMap) {
            this._childrenMap = new Map();
        }
        this._childrenMap.clear();
        const repos = this.ctx.getAllRepositores();
        const expand = repos.length === 1;
        repos.forEach(repo => {
            this._childrenMap!.set(repo.rootUri.toString(), new RepositoriesNode(repo, expand));
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    addItems(prs: PaginatedPullRequests): void {
        if (!this._childrenMap || !this._childrenMap.get(prs.repository.rootUri.toString())) {
            return;
        }

        this._childrenMap.get(prs.repository.rootUri.toString())!.addItems(prs);
        this.refresh();
    }

    getTreeItem(element: BaseNode): vscode.TreeItem {
        return element.getTreeItem();
    }

    async getChildren(element?: BaseNode): Promise<BaseNode[]> {
        if (element) {
            return element.getChildren();
        }
        if (!this._childrenMap) {
            this.updateChildren();
        }
        return Array.from(this._childrenMap!.values());
    }

    dispose() {
        this._disposables.forEach(disposable => disposable && disposable.dispose());
    }
}