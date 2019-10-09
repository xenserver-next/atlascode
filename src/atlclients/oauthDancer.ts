import * as vscode from 'vscode';
import { Logger } from '../logger';
import * as express from 'express';
import * as http from 'http';
import { Resources } from '../resources';
import { Time } from '../util/time';
import { OAuthProvider, OAuthResponse, ProductJira, ProductBitbucket, AccessibleResource, UserInfo, emptyUserInfo } from './authInfo';
import { Disposable } from 'vscode';
import axios, { AxiosInstance } from 'axios';
import { URL } from 'url';
import { JiraProdStrategy, JiraStagingStrategy, BitbucketProdStrategy, BitbucketStagingStrategy } from './strategy';
import PCancelable from 'p-cancelable';
import pTimeout from 'p-timeout';
import EventEmitter from 'eventemitter3';
import { v4 } from 'uuid';
import { getAgent } from './agent';
import { promisify } from 'util';

const vscodeurl = vscode.version.endsWith('-insider') ? 'vscode-insiders://atlassian.atlascode/openSettings' : 'vscode://atlassian.atlascode/openSettings';

declare interface ResponseEvent {
    provider: OAuthProvider;
    strategy: any;
    req: express.Request;
    res: express.Response;
}

declare interface Tokens {
    accessToken: string;
    refreshToken: string;
}

export class OAuthDancer implements Disposable {
    private static _instance: OAuthDancer;

    private _srv: http.Server | undefined;
    private _app: any;
    private _axios: AxiosInstance = axios.create({
        timeout: 30 * Time.SECONDS,
        headers: {
            "Accept-Encoding": "gzip, deflate"
        }
    });
    private _authErrors: Map<OAuthProvider, string> = new Map();
    private _authsInFlight: Map<OAuthProvider, PCancelable<OAuthResponse>> = new Map();
    private _oauthResponseEventEmitter: EventEmitter = new EventEmitter();
    private _shutdownCheck: any;
    private _shutdownCheckInterval = 5 * Time.MINUTES;
    private _browserTimeout = 5 * Time.MINUTES;

    private constructor() {
        this._app = this.createApp();
    }

    public static get Instance(): OAuthDancer {
        return this._instance || (this._instance = new this());
    }

    dispose() {
        this.forceShutdownAll();
    }

    private getAuthorizeURL(provider: OAuthProvider, state: string): string {
        let finalUrl = '';

        switch (provider) {
            case OAuthProvider.JiraCloud: {
                const url = new URL(JiraProdStrategy.authorizationURL);
                url.searchParams.append('client_id', JiraProdStrategy.clientID);
                url.searchParams.append('redirect_uri', JiraProdStrategy.callbackURL);
                url.searchParams.append('response_type', 'code');
                url.searchParams.append('scope', JiraProdStrategy.scope);
                url.searchParams.append('audience', JiraProdStrategy.authParams.audience);
                url.searchParams.append('prompt', JiraProdStrategy.authParams.prompt);
                url.searchParams.append('state', state);

                finalUrl = url.toString();
                break;
            }
            case OAuthProvider.JiraCloudStaging: {
                const url = new URL(JiraStagingStrategy.authorizationURL);
                url.searchParams.append('client_id', JiraStagingStrategy.clientID);
                url.searchParams.append('redirect_uri', JiraStagingStrategy.callbackURL);
                url.searchParams.append('response_type', 'code');
                url.searchParams.append('scope', JiraStagingStrategy.scope);
                url.searchParams.append('audience', JiraStagingStrategy.authParams.audience);
                url.searchParams.append('prompt', JiraStagingStrategy.authParams.prompt);
                url.searchParams.append('state', state);

                finalUrl = url.toString();
                break;
            }
            case OAuthProvider.BitbucketCloud: {
                const url = new URL(BitbucketProdStrategy.authorizationURL);
                url.searchParams.append('client_id', BitbucketProdStrategy.clientID);
                url.searchParams.append('response_type', 'code');
                url.searchParams.append('state', state);

                finalUrl = url.toString();
                break;
            }
            case OAuthProvider.BitbucketCloudStaging: {
                const url = new URL(BitbucketStagingStrategy.authorizationURL);
                url.searchParams.append('client_id', BitbucketStagingStrategy.clientID);
                url.searchParams.append('response_type', 'code');
                url.searchParams.append('state', state);

                finalUrl = url.toString();
                break;
            }
        }

        return finalUrl;
    }

    private createApp(): any {
        let app = express();

        app.get('/' + OAuthProvider.BitbucketCloud, (req, res) => {
            this._oauthResponseEventEmitter.emit('response', { provider: OAuthProvider.BitbucketCloud, strategy: BitbucketProdStrategy, req: req, res: res });
        });

        app.get('/' + OAuthProvider.BitbucketCloudStaging, (req, res) => {
            this._oauthResponseEventEmitter.emit('response', { provider: OAuthProvider.BitbucketCloudStaging, strategy: BitbucketStagingStrategy, req: req, res: res });
        });

        app.get('/' + OAuthProvider.JiraCloud, (req, res) => {
            this._oauthResponseEventEmitter.emit('response', { provider: OAuthProvider.JiraCloud, strategy: JiraProdStrategy, req: req, res: res });
        });

        app.get('/' + OAuthProvider.JiraCloudStaging, (req, res) => {
            this._oauthResponseEventEmitter.emit('response', { provider: OAuthProvider.JiraCloudStaging, strategy: JiraStagingStrategy, req: req, res: res });
        });

        app.get('/timeout', (req, res) => {
            let provider = req.query.provider;
            this._authErrors.set(provider, `'Authorization did not complete in the time alotted for '${provider}'`);
            Logger.debug("oauth timed out", req.query);
            res.send(Resources.html.get('authFailureHtml')!({
                errMessage: 'Authorization did not complete in the time alotted.',
                actionMessage: 'Please try again.',
                vscodeurl: vscodeurl
            }));
        });

        return app;
    }

    public async doDance(provider: OAuthProvider): Promise<OAuthResponse> {
        const currentlyInflight = this._authsInFlight.get(provider);
        if (currentlyInflight) {
            currentlyInflight.cancel(`Authentication for ${provider} has been cancelled.`);
            this._authsInFlight.delete(provider);
        }

        const state = v4();
        const cancelPromise = new PCancelable<OAuthResponse>((resolve, reject, onCancel) => {
            const myState = state;
            const responseListener = async (respEvent: ResponseEvent) => {
                const product = (respEvent.provider.startsWith('jira')) ? ProductJira : ProductBitbucket;

                if (respEvent.req.query && respEvent.req.query.code && respEvent.req.query.state && respEvent.req.query.state === myState) {
                    try {
                        const agent = getAgent();
                        let tokens: Tokens = { accessToken: "", refreshToken: "" };
                        let accessibleResources: AccessibleResource[] = [];
                        let user: UserInfo = emptyUserInfo;

                        if (product === ProductJira) {
                            tokens = await this.getJiraTokens(respEvent.strategy, respEvent.req.query.code, agent);
                            accessibleResources = await this.getJiraResources(respEvent.strategy, tokens.accessToken, agent);
                            if (accessibleResources.length > 0) {
                                user = await this.getJiraUser(respEvent.provider, tokens.accessToken, accessibleResources[0], agent);
                            } else {
                                throw new Error(`No accessible resources found for ${provider}`);
                            }

                        } else {
                            if (provider === OAuthProvider.BitbucketCloud) {
                                accessibleResources.push({
                                    id: OAuthProvider.BitbucketCloud,
                                    name: ProductBitbucket.name,
                                    scopes: [],
                                    avatarUrl: "",
                                    url: "https://bitbucket.org"
                                });
                            } else {
                                accessibleResources.push({
                                    id: OAuthProvider.BitbucketCloudStaging,
                                    name: ProductBitbucket.name,
                                    scopes: [],
                                    avatarUrl: "",
                                    url: "https://bb-inf.net"
                                });
                            }

                            tokens = await this.getBitbucketTokens(respEvent.strategy, respEvent.req.query.code, agent);
                            user = await this.getBitbucketUser(respEvent.strategy, tokens.accessToken, agent);
                        }

                        this._authsInFlight.delete(respEvent.provider);

                        respEvent.res.send(Resources.html.get('authSuccessHtml')!({
                            product: product,
                            vscodeurl: vscodeurl
                        }));

                        const oauthResponse: OAuthResponse = {
                            access: tokens.accessToken,
                            refresh: tokens.refreshToken,
                            user: user,
                            accessibleResources: accessibleResources
                        };
                        this.maybeShutdown();
                        resolve(oauthResponse);

                    } catch (err) {
                        this._authsInFlight.delete(respEvent.provider);

                        respEvent.res.send(Resources.html.get('authFailureHtml')!({
                            errMessage: `Error authenticating with ${provider}: ${err}`,
                            actionMessage: 'Give it a moment and try again.',
                            vscodeurl: vscodeurl
                        }));

                        reject(`Error authenticating with ${provider}: ${err}`);
                    }
                }
            };

            this._oauthResponseEventEmitter.addListener('response', responseListener);

            onCancel(() => {
                this._authsInFlight.delete(provider);
                this.maybeShutdown();
            });
        });

        this._authsInFlight.set(provider, cancelPromise);

        if (!this._srv) {
            this._srv = http.createServer(this._app);
            const listenPromise = promisify(this._srv.listen.bind(this._srv));
            try {
                await listenPromise(31415, () => { });
                Logger.debug('auth server started on port 31415');
            } catch (err) {
                Logger.error(new Error(`Unable to start auth listener on localhost:31415: ${err}`));
                return Promise.reject(`Unable to start auth listener on localhost:31415: ${err}`);
            }


            this.startShutdownChecker();
        }

        vscode.env.openExternal(vscode.Uri.parse(this.getAuthorizeURL(provider, state)));

        return pTimeout<OAuthResponse, OAuthResponse>(cancelPromise, this._browserTimeout, (): Promise<OAuthResponse> => {
            vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:31415/timeout?provider=${provider}`));
            return Promise.reject(`'Authorization did not complete in the time alotted for '${provider}'`);
        });

    }

    private async getJiraTokens(strategy: any, code: string, agent?: any): Promise<Tokens> {
        try {
            const tokenResponse = await this._axios(strategy.tokenURL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                data: JSON.stringify({
                    grant_type: 'authorization_code',
                    client_id: strategy.clientID,
                    client_secret: strategy.clientSecret,
                    code: code,
                    redirect_uri: strategy.callbackURL,
                }),
                httpsAgent: agent
            });

            const data = tokenResponse.data;
            return { accessToken: data.access_token, refreshToken: data.refresh_token };
        } catch (err) {
            const newErr = new Error(`Error fetching Jira tokens: ${err}`);
            Logger.error(newErr);
            throw newErr;
        }
    }

    private async getBitbucketTokens(strategy: any, code: string, agent?: any): Promise<Tokens> {
        try {
            const basicAuth = Buffer.from(`${strategy.clientID}:${strategy.clientSecret}`).toString('base64');

            const tokenResponse = await this._axios(strategy.tokenURL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Authorization: `Basic ${basicAuth}`
                },
                data: `grant_type=authorization_code&code=${code}`,
                httpsAgent: agent
            });

            const data = tokenResponse.data;
            return { accessToken: data.access_token, refreshToken: data.refresh_token };
        } catch (err) {
            const newErr = new Error(`Error fetching Bitbucket tokens: ${err}`);
            Logger.error(newErr);
            throw newErr;
        }
    }

    private async getJiraResources(strategy: any, accessToken: string, agent?: any): Promise<AccessibleResource[]> {
        try {
            const resources: AccessibleResource[] = [];

            const resourcesResponse = await this._axios(strategy.accessibleResourcesURL, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Authorization: `Bearer ${accessToken}`
                },
                httpsAgent: agent
            });

            resourcesResponse.data.forEach((resource: AccessibleResource) => {
                resources.push(resource);
            });

            return resources;
        } catch (err) {
            const newErr = new Error(`Error fetching Jira resources: ${err}`);
            Logger.error(newErr);
            throw newErr;
        }
    }

    private async getJiraUser(provider: OAuthProvider, accessToken: string, resource: AccessibleResource, agent?: any): Promise<UserInfo> {
        try {
            let apiUri = provider === OAuthProvider.JiraCloudStaging ? "api.stg.atlassian.com" : "api.atlassian.com";
            const url = `https://${apiUri}/ex/jira/${resource.id}/rest/api/2/myself`;

            const userResponse = await this._axios(url, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Authorization: `Bearer ${accessToken}`
                },
                httpsAgent: agent
            });

            const data = userResponse.data;

            return {
                id: data.accountId,
                displayName: data.displayName,
                email: data.emailAddress,
                avatarUrl: data.avatarUrls["48x48"],
            };
        } catch (err) {
            const newErr = new Error(`Error fetching Jira user: ${err}`);
            Logger.error(newErr);
            throw newErr;
        }
    }

    private async getBitbucketUser(strategy: any, accessToken: string, agent?: any): Promise<UserInfo> {
        try {
            const userResponse = await this._axios(strategy.profileURL, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Authorization: `Bearer ${accessToken}`
                },
                httpsAgent: agent
            });

            let email = 'do-not-reply@atlassian.com';
            try {
                const emailsResponse = await this._axios(strategy.emailsURL, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                        Authorization: `Bearer ${accessToken}`
                    },
                    httpsAgent: agent
                });

                if (Array.isArray(emailsResponse.data.values) && emailsResponse.data.values.length > 0) {
                    const primary = emailsResponse.data.values.filter((val: any) => val.is_primary);
                    if (primary.length > 0) {
                        email = primary[0].email;
                    }
                }
            } catch (e) {
                //ignore
            }

            const userData = userResponse.data;

            return {
                id: userData.account_id,
                displayName: userData.display_name,
                email: email,
                avatarUrl: userData.links.avatar.href,
            };
        } catch (err) {
            const newErr = new Error(`Error fetching Bitbucket user: ${err}`);
            Logger.error(newErr);
            throw newErr;
        }
    }

    private maybeShutdown() {
        if (this._authsInFlight.entries.length < 1) {
            if (this._shutdownCheck) {
                clearInterval(this._shutdownCheck);
            }

            if (this._srv) {
                this._srv.close();
                this._srv = undefined;
                Logger.debug('auth server on port 31415 has been shutdown');
            }
        }
    }

    private forceShutdownAll() {
        this._authsInFlight.forEach((promise) => {
            promise.cancel();
        });

        this._authsInFlight.clear();

        if (this._shutdownCheck) {
            clearInterval(this._shutdownCheck);
        }

        if (this._srv) {
            this._srv.close();
            this._srv = undefined;
            Logger.debug('auth server on port 31415 has been shutdown');
        }
    }

    private startShutdownChecker() {
        //make sure we clear the old one in case they click multiple times
        const oldTimer = this._shutdownCheck;
        if (oldTimer) {
            clearInterval(oldTimer);
        }

        this._shutdownCheck = setInterval(this.maybeShutdown, this._shutdownCheckInterval);
    }
}
