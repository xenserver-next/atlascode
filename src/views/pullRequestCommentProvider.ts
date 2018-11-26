import * as vscode from 'vscode';
import { PullRequestNodeDataProvider } from './pullRequestNodeDataProvider';
import { PullRequestApi } from '../bitbucket/pullRequests';
import { FileDiffQueryParams } from './nodes/pullRequestNode';

export class PullRequestCommentProvider implements vscode.DocumentCommentProvider, vscode.Disposable {
    private _onDidChangeCommentThreads: vscode.EventEmitter<vscode.CommentThreadChangedEvent> = new vscode.EventEmitter<vscode.CommentThreadChangedEvent>();
    public onDidChangeCommentThreads: vscode.Event<vscode.CommentThreadChangedEvent> = this._onDidChangeCommentThreads.event;

    async provideDocumentComments(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CommentInfo> {
        const { commentThreads, path } = JSON.parse(document.uri.query) as FileDiffQueryParams;
        let commentingRanges: vscode.Range[] = [];
        if (path) {
            commentingRanges = [new vscode.Range(0, 0, document.lineCount - 1, 0)];
        }

        if (!commentThreads || commentThreads.length === 0) {
            return {
                commentingRanges: commentingRanges,
                threads: []
            };
        }

        let threads: vscode.CommentThread[] = [];
        commentThreads
            .forEach((c: Bitbucket.Schema.Comment[]) => {
                let range = new vscode.Range(0, 0, 0, 0);
                if (c[0].inline!.from) {
                    range = new vscode.Range(c[0].inline!.from! - 1, 0, c[0].inline!.from! - 1, 0);
                } else if (c[0].inline!.to) {
                    range = new vscode.Range(c[0].inline!.to! - 1, 0, c[0].inline!.to! - 1, 0);
                }
                threads.push({
                    comments: c.map(cc => {
                        return {
                            userName: cc.user!.display_name!,
                            body: new vscode.MarkdownString(cc.content!.raw),
                            commentId: String(cc.id!)
                        };
                    }),
                    range: range,
                    resource: vscode.Uri.parse(`${PullRequestNodeDataProvider.SCHEME}://${document.fileName}`),
                    threadId: String(c[0].id!),
                    collapsibleState: vscode.CommentThreadCollapsibleState.Expanded
                });
            });
        return {
            commentingRanges: commentingRanges,
            threads: threads
        };
    }

    async createNewCommentThread(document: vscode.TextDocument, range: vscode.Range, text: string, token: vscode.CancellationToken): Promise<vscode.CommentThread> {
        const { remote, prId, path, lhs } = JSON.parse(document.uri.query) as FileDiffQueryParams;
        const inline = {
            from: lhs ? range.start.line + 1 : undefined,
            to: lhs ? undefined : range.start.line + 1,
            path: path
        };
        const { data } = await PullRequestApi.postComment(remote, prId, text, undefined, inline);
        this._onDidChangeCommentThreads.fire();
        return {
            collapsibleState: vscode.CommentThreadCollapsibleState.Expanded,
            range: range,
            resource: document.uri,
            threadId: String(data.id!),
            comments: [
                {
                    body: new vscode.MarkdownString(data.content!.raw),
                    userName: data.user!.display_name!,
                    commentId: String(data.id!)
                }
            ]
        };
    }

    async replyToCommentThread(document: vscode.TextDocument, range: vscode.Range, commentThread: vscode.CommentThread, text: string, token: vscode.CancellationToken): Promise<vscode.CommentThread> {
        const { remote, prId } = JSON.parse(document.uri.query) as FileDiffQueryParams;
        const { data } = await PullRequestApi.postComment(remote, prId, text, Number(commentThread.threadId));
        this._onDidChangeCommentThreads.fire();
        commentThread.comments.push(
            {
                body: new vscode.MarkdownString(data.content!.raw),
                userName: data.user!.display_name!,
                commentId: String(data.id!)
            }
        );

        return commentThread;
    }

    dispose() {
        this._onDidChangeCommentThreads.dispose();
    }
}

const prDocumentCommentProvider = new PullRequestCommentProvider();

export function getPRDocumentCommentProvider(): PullRequestCommentProvider {
    return prDocumentCommentProvider;
}