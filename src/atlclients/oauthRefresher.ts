
import { Disposable } from 'vscode';
import { OAuthProvider, ProductJira, ProductBitbucket } from './authInfo';
import axios, { AxiosInstance } from 'axios';
import { Time } from '../util/time';
import { BitbucketStagingStrategy, BitbucketProdStrategy, JiraStagingStrategy, JiraProdStrategy } from './strategy';
import { getAgent } from './agent';

export class OAuthRefesher implements Disposable {
    private _axios: AxiosInstance = axios.create({
        timeout: 30 * Time.SECONDS,
        headers: {
            'User-Agent': 'atlascode/2.x',
            "Accept-Encoding": "gzip, deflate"
        }
    });

    dispose() {

    }

    public async getNewAccessToken(provider: OAuthProvider, refreshToken: string): Promise<string | undefined> {

        const product = (provider.startsWith('jira')) ? ProductJira : ProductBitbucket;

        if (product === ProductJira) {
            const strategy = provider.endsWith('staging') ? JiraStagingStrategy : JiraProdStrategy;
            const tokenResponse = await this._axios(strategy.tokenURL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                data: JSON.stringify({
                    grant_type: 'refresh_token',
                    client_id: strategy.clientID,
                    client_secret: strategy.clientSecret,
                    refresh_token: refreshToken,
                    redirect_uri: strategy.callbackURL,
                }),
                httpsAgent: getAgent()
            });

            const data = tokenResponse.data;
            return data.access_token;

        } else {
            const strategy = provider.endsWith('staging') ? BitbucketStagingStrategy : BitbucketProdStrategy;
            const basicAuth = Buffer.from(`${strategy.clientID}:${strategy.clientSecret}`).toString('base64');

            const tokenResponse = await this._axios(strategy.tokenURL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Authorization: `Basic ${basicAuth}`
                },
                data: `grant_type=refresh_token&refresh_token=${refreshToken}`,
                httpsAgent: getAgent()
            });

            const data = tokenResponse.data;
            return data.access_token;
        }
    }
}