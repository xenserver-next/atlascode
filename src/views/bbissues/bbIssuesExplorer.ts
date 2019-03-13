import { Disposable, ConfigurationChangeEvent, window, commands, TreeViewVisibilityChangeEvent, TreeView } from "vscode";
import { Time } from '../../util/time';
import { Container } from "../../container";
import { configuration } from "../../config/configuration";
import { setCommandContext, CommandContext, BitbucketIssuesTreeViewId } from "../../constants";
import { BitbucketContext } from "../../bitbucket/context";
import { Commands } from "../../commands";
import { AuthProvider } from "../../atlclients/authInfo";
import { viewScreenEvent } from "../../analytics";
import { BitbucketIssuesDataProvider } from "../bitbucketIssuesDataProvider";
import { BaseNode } from "../nodes/baseNode";

const defaultRefreshInterval = 15 * Time.MINUTES;

export class BitbucketIssuesExplorer extends Disposable {
    private _disposable: Disposable;
    private _timer: any | undefined;
    private _refreshInterval = defaultRefreshInterval;
    private _tree: TreeView<BaseNode> | undefined;
    private _bitbucketIssuesDataProvider: BitbucketIssuesDataProvider;

    constructor(private _ctx: BitbucketContext) {
        super(() => this.dispose());

        this._bitbucketIssuesDataProvider = new BitbucketIssuesDataProvider(_ctx);

        commands.registerCommand(Commands.BitbucketIssuesRefresh, this.refresh, this);

        Container.context.subscriptions.push(
            configuration.onDidChange(this.onConfigurationChanged, this)
        );
        this._disposable = Disposable.from(
            this._ctx.onDidChangeBitbucketContext(() => {
                this.refresh();
            })
        );

        void this.onConfigurationChanged(configuration.initializingChangeEvent);
    }

    private async onConfigurationChanged(e: ConfigurationChangeEvent) {
        const initializing = configuration.initializing(e);
        if (initializing || configuration.changed(e, 'bitbucket.issues.refreshInterval')) {
            this._refreshInterval = Container.config.bitbucket.issues.refreshInterval * Time.MINUTES;
        }

        if (initializing || configuration.changed(e, 'bitbucket.issues.explorerEnabled')) {
            if (!Container.config.bitbucket.issues.explorerEnabled) {
                if (this._tree) {
                    this._tree.dispose();
                }
                this._tree = undefined;
            } else {
                this._tree = window.createTreeView(BitbucketIssuesTreeViewId, {
                    treeDataProvider: this._bitbucketIssuesDataProvider
                });
                this._tree.onDidChangeVisibility(e => this.onTreeDidChangeVisibility(e));
            }
            setCommandContext(CommandContext.BitbucketIssuesExplorer, Container.config.bitbucket.issues.explorerEnabled);
        }

        if (!Container.config.bitbucket.issues.explorerEnabled) {
            this.stopTimer();
        } else {
            this.stopTimer();
            this.startTimer();
        }
    }

    dispose() {
        if (this._bitbucketIssuesDataProvider) {
            this._bitbucketIssuesDataProvider.dispose();
        }
        if (this._tree) {
            this._tree.dispose();
        }
        this._disposable.dispose();
    }

    refresh() {
        if (this._tree && this._bitbucketIssuesDataProvider) {
            this._bitbucketIssuesDataProvider.refresh();
        }
    }

    private startTimer() {
        if (this._refreshInterval > 0 && !this._timer) {
            this._timer = setInterval(() => {
                this.refresh();
            }, this._refreshInterval);
        }
    }

    private stopTimer() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = undefined;
        }
    }

    async onTreeDidChangeVisibility(event: TreeViewVisibilityChangeEvent) {
        if (event.visible && await Container.authManager.isAuthenticated(AuthProvider.BitbucketCloud)) {
            this.refresh();
            viewScreenEvent(BitbucketIssuesTreeViewId).then(e => { Container.analyticsClient.sendScreenEvent(e); });
        }
    }
}
