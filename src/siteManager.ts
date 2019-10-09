import { Disposable, EventEmitter, Event, Memento } from "vscode";
import { ProductJira, ProductBitbucket, AuthInfoEvent, Product, DetailedSiteInfo, emptySiteInfo, SiteInfo, isRemoveAuthEvent } from "./atlclients/authInfo";
import { Container } from "./container";
import { configuration } from "./config/configuration";


export type SitesAvailableUpdateEvent = {
    sites: DetailedSiteInfo[];
    product: Product;
};

const SitesSuffix: string = 'Sites';

export class SiteManager extends Disposable {
    private _disposable: Disposable;
    private _sitesAvailable: Map<string, DetailedSiteInfo[]>;
    private _globalStore: Memento;

    private _onDidSitesAvailableChange = new EventEmitter<SitesAvailableUpdateEvent>();
    public get onDidSitesAvailableChange(): Event<SitesAvailableUpdateEvent> {
        return this._onDidSitesAvailableChange.event;
    }

    constructor(globalStore: Memento) {
        super(() => this.dispose());

        this._globalStore = globalStore;
        this._sitesAvailable = new Map<string, DetailedSiteInfo[]>();
        this._sitesAvailable.set(ProductJira.key, []);
        this._sitesAvailable.set(ProductBitbucket.key, []);

        this._disposable = Disposable.from(
            Container.credentialManager.onDidAuthChange(this.onDidAuthChange, this)
        );
    }

    dispose() {
        this._disposable.dispose();
        this._onDidSitesAvailableChange.dispose();
    }

    public addSites(newSites: DetailedSiteInfo[]) {
        if (newSites.length === 0) {
            return;
        }
        const productKey = newSites[0].product.key;
        let notify = true;
        let allSites = this._globalStore.get<DetailedSiteInfo[]>(`${productKey}${SitesSuffix}`);
        if (allSites) {
            newSites = newSites.filter(s => !allSites!.some(s2 => s2.id === s.id && s2.userId === s.userId));
            if (newSites.length === 0) {
                notify = false;
            }
            allSites = allSites.concat(newSites);
        } else {
            allSites = newSites;
        }

        this._globalStore.update(`${productKey}${SitesSuffix}`, allSites);
        this._sitesAvailable.set(productKey, allSites);

        if (notify) {
            this._onDidSitesAvailableChange.fire({ sites: allSites, product: allSites[0].product });
        }
    }

    onDidAuthChange(e: AuthInfoEvent) {
        if (isRemoveAuthEvent(e)) {
            const deadSites = this.getSitesAvailable(e.product).filter(site => site.credentialId === e.credentialId);
            deadSites.forEach(s => this.removeSite(s));
            if (deadSites.length > 0) {
                this._onDidSitesAvailableChange.fire({ sites: this.getSitesAvailable(e.product), product: e.product });
            }
        }
    }

    public getSitesAvailable(product: Product): DetailedSiteInfo[] {
        return this.getSitesAvailableForKey(product.key);
    }

    private getSitesAvailableForKey(productKey: string): DetailedSiteInfo[] {
        let sites = this._sitesAvailable.get(productKey);

        if (!sites || sites.length < 1) {
            sites = this._globalStore.get<DetailedSiteInfo[]>(`${productKey}${SitesSuffix}`);
            if (!sites) {
                sites = [];
            }

            this._sitesAvailable.set(productKey, sites);
        }

        return sites;
    }

    public getFirstSite(productKey: string): DetailedSiteInfo {
        const sites: DetailedSiteInfo[] = this.getSitesAvailableForKey(productKey);

        if (sites.length > 0) {
            return sites[0];
        }
        return emptySiteInfo;
    }

    public getFirstAAID(productKey?: string): string | undefined {
        if (productKey) {
            return this.getFirstAAIDForProduct(productKey);
        }
        let userId = this.getFirstAAIDForProduct(ProductJira.key);
        if (userId) {
            return userId;
        }
        return this.getFirstAAIDForProduct(ProductBitbucket.key);
    }

    private getFirstAAIDForProduct(productKey: string): string | undefined {
        const sites = this.getSitesAvailableForKey(productKey);
        const cloudSites = sites.filter(s => s.isCloud);
        if (cloudSites.length > 0) {
            return cloudSites[0].userId;
        }

        return undefined;
    }

    public productHasAtLeastOneSite(product: Product): boolean {
        return this.getSitesAvailable(product).length > 0;
    }

    public getSiteForHostname(product: Product, hostname: string): DetailedSiteInfo | undefined {
        let site = this.getSitesAvailable(product).find(site => site.hostname === hostname);
        if (site) {
            return site;
        }

        return this.getSitesAvailable(product).find(site => Container.bitbucketContext && Container.bitbucketContext.getMirrors(site.hostname).includes(hostname));
    }

    public getSiteForId(product: Product, id: string): DetailedSiteInfo | undefined {
        return this.getSitesAvailable(product).find(site => site.id === id);
    }

    public removeSite(site: SiteInfo): boolean {
        const sites = this._globalStore.get<DetailedSiteInfo[]>(`${site.product.key}${SitesSuffix}`);
        if (sites && sites.length > 0) {
            const foundIndex = sites.findIndex(availableSite => availableSite.hostname === site.hostname);
            if (foundIndex > -1) {
                const deletedSite = sites[foundIndex];
                sites.splice(foundIndex, 1);
                this._globalStore.update(`${site.product.key}${SitesSuffix}`, sites);
                this._sitesAvailable.set(site.product.key, sites);
                this._onDidSitesAvailableChange.fire({ sites: sites, product: site.product });
                if (sites.length === 0) {
                    Container.credentialManager.removeAuthInfo(deletedSite);
                }

                if (deletedSite.id === Container.config.jira.lastCreateSiteAndProject.siteId) {
                    configuration.setLastCreateSiteAndProject(undefined);
                }

                return true;
            }
        }

        return false;
    }
}