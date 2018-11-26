import * as path from 'path';
import {
    Disposable,
    Uri,
    ViewColumn,
    WebviewPanel,
    WebviewPanelOnDidChangeViewStateEvent,
    EventEmitter,
    Event,
    window
} from 'vscode';
import { Resources } from '../resources';
import { Action, isAlertable } from '../ipc/messaging';
import { Logger } from '../logger';

// ReactWebview is an interface that can be used to deal with webview objects when you don't know their generic typings.
export interface ReactWebview extends Disposable {
    hide(): void;
    createOrShow(): Promise<void>;
    onDidPanelDispose(): Event<void>;
    invalidate(): void;
 }

 // InitializingWebview is an interface that exposes an initialize method that may be called to initialize the veiw object with data.
 // Type T is the type of the data that's passed to the initialize method.
 // This interface is called in AbstractMultiViewManager
 export interface InitializingWebview<T> {
    initialize(data:T): void;
 }

 // isInitializable tests to see if a webview is an InitializingWebview and casts it if it is.
 export function isInitializable(object: any): object is InitializingWebview<any> {
    return (<InitializingWebview<any>>object).initialize !== undefined;
}

// AbstractReactWebview is the base class for atlascode react webviews.
// This handles the panel creation/disposing, comms between vscode and react, etc.
// Generic Types:
// S = the type of ipc.Message to send to react
// R = the type of ipc.Action to receive from react
export abstract class AbstractReactWebview<S,R extends Action> implements ReactWebview {
    private _disposablePanel: Disposable | undefined;
    protected _panel: WebviewPanel | undefined;
    private readonly _extensionPath: string;
    private static readonly viewType = 'react';
    private _onDidPanelDispose = new EventEmitter<void>();

    constructor(extensionPath: string) {
        this._extensionPath = extensionPath;

    }

    onDidPanelDispose(): Event<void> {
        return this._onDidPanelDispose.event;
    }
    abstract get title(): string;
    abstract get id(): string;
    abstract invalidate(): void;

    get visible() {
        return this._panel === undefined ? false : this._panel.visible;
    }

    hide() {
        if (this._panel === undefined) { return; }

        this._panel.dispose();
    }

    async createOrShow(): Promise<void> {
        if (this._panel === undefined) {
            this._panel = window.createWebviewPanel(
                AbstractReactWebview.viewType,
                this.title,
                ViewColumn.Active, // { viewColumn: ViewColumn.Active, preserveFocus: false }
                {
                    retainContextWhenHidden: true,
                    enableFindWidget: true,
                    enableCommandUris: true,
                    enableScripts: true,
                    localResourceRoots: [Uri.file(path.join(this._extensionPath, 'build'))]
                }
            );

            this._disposablePanel = Disposable.from(
                this._panel,
                this._panel.onDidDispose(this.onPanelDisposed, this),
                this._panel.onDidChangeViewState(this.onViewStateChanged, this),
                this._panel.webview.onDidReceiveMessage(this.onMessageReceived, this)
            );

            this._panel.webview.html = this._getHtmlForWebview(this.id);
        }
        else {
            this._panel.webview.html = this._getHtmlForWebview(this.id);
            this._panel.reveal(ViewColumn.Active); // , false);
        }
    }

    private onViewStateChanged(e: WebviewPanelOnDidChangeViewStateEvent) {
        Logger.debug('AbstractReactWebview.onViewStateChanged', e.webviewPanel.visible);
        // HACK: Because messages aren't sent to the webview when hidden, we need make sure it is up-to-date
        if (e.webviewPanel.visible) {
            this.invalidate();
            this.createOrShow();
        }
    }

    protected onMessageReceived(a: R):boolean {
        switch (a.action) {
            case 'alertError': {
                if(isAlertable(a)) {
                    window.showErrorMessage(a.message);
                }
                return true;
            }
        }
        return false;
    }

    protected postMessage(message:S) {
        if (this._panel === undefined){ return false; }

        const result = this._panel!.webview.postMessage(message);

        return result;
    }

    private onPanelDisposed() {
        Logger.debug("webview panel disposed");
        if (this._disposablePanel){ this._disposablePanel.dispose();}
        this._panel = undefined;
        this._onDidPanelDispose.fire();
    }

    public dispose() {
        Logger.debug("vscode webview disposed");
        if(this._disposablePanel) {
            this._disposablePanel.dispose();
        }
    }

    private _getHtmlForWebview(viewName:string) {
        const manifest = require(path.join(this._extensionPath, 'build', 'asset-manifest.json'));
        const mainScript = manifest['main.js'];
        const mainStyle = manifest['main.css'];

        const scriptUri = Uri.file(path.join(this._extensionPath, 'build', mainScript)).with({ scheme: 'vscode-resource' });
        const styleUri = Uri.file(path.join(this._extensionPath, 'build', mainStyle)).with({ scheme: 'vscode-resource' });
        const tmpl = Resources.html.get('reactHtml');

        if (tmpl) {
            return tmpl({
                view:viewName,
                styleUri: styleUri,
                scriptUri: scriptUri,
                baseUri: Uri.file(path.join(this._extensionPath, 'build')).with({ scheme: 'vscode-resource' })
            });
        } else {
            return Resources.htmlNotFound({resource: 'reactHtml'});
        }
        
    }
}