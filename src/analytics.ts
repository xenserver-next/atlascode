import { TrackEvent, ScreenEvent, UIEvent } from './analytics-node-client/src/index';
import { Container } from './container';
import { DetailedSiteInfo, ProductJira, isEmptySiteInfo, Product } from './atlclients/authInfo';
import { PullRequestTreeViewId, BitbucketIssuesTreeViewId } from './constants';

// IMPORTANT
// Make sure there is a corresponding event with the correct attributes in the Data Portal for any event created here.
// https://data-portal.us-east-1.prod.public.atl-paas.net/analytics/registry?filter=externalProductIntegrations

export const Registry = {
    screen: {
        pullRequestDiffScreen: 'pullRequestDiffScreen',
        pullRequestPreviewDiffScreen: 'pullRequestPreviewDiffScreen'
    }
};

class AnalyticsPlatform {
    private static nodeJsPlatformMapping = {
        'aix': 'desktop',
        'android': 'android',
        'darwin': 'mac',
        'freebsd': 'desktop',
        'linux': 'linux',
        'openbsd': 'desktop',
        'sunos': 'desktop',
        'win32': 'windows',
        'cygwin': 'windows'
    };

    static for(p: string): string {
        return this.nodeJsPlatformMapping[p] || 'unknown';
    }
}

// Extension lifecycle events

export async function installedEvent(version: string): Promise<TrackEvent> {
    return trackEvent('installed', 'atlascode', { attributes: { machineId: Container.machineId, version: version } });
}

export async function upgradedEvent(version: string, previousVersion: string): Promise<TrackEvent> {
    return trackEvent('upgraded', 'atlascode', { attributes: { machineId: Container.machineId, version: version, previousVersion: previousVersion } });
}

export async function featureChangeEvent(featureId: string, enabled: boolean): Promise<TrackEvent> {
    let action = enabled ? 'enabled' : 'disabled';
    return trackEvent(action, 'feature', { actionSubjectId: featureId });
}

export async function authenticatedEvent(site: DetailedSiteInfo): Promise<TrackEvent> {
    return instanceTrackEvent(site, 'authenticated', 'atlascode', { attributes: { machineId: Container.machineId, hostProduct: site.product.name } });
}

export async function loggedOutEvent(site: DetailedSiteInfo): Promise<TrackEvent> {
    return instanceTrackEvent(site, 'unauthenticated', 'atlascode', { attributes: { machineId: Container.machineId, hostProduct: site.product.name } });
}

// Jira issue events

export async function issueCreatedEvent(site: DetailedSiteInfo, issueKey: string): Promise<TrackEvent> {
    return instanceTrackEvent(site, 'created', 'issue', { actionSubjectId: issueKey });
}

export async function issueTransitionedEvent(site: DetailedSiteInfo, issueKey: string): Promise<TrackEvent> {
    return instanceTrackEvent(site, 'transitioned', 'issue', { actionSubjectId: issueKey });
}

export async function issueUrlCopiedEvent(tenantId: string): Promise<TrackEvent> {
    return tenantTrackEvent(tenantId, 'copied', 'issueUrl');
}

export async function issueCommentEvent(site: DetailedSiteInfo): Promise<TrackEvent> {
    return instanceTrackEvent(site, 'created', 'issueComment');
}

export async function issueWorkStartedEvent(site: DetailedSiteInfo): Promise<TrackEvent> {
    return instanceTrackEvent(site, 'workStarted', 'issue');
}

export async function issueUpdatedEvent(site: DetailedSiteInfo, issueKey: string, fieldName: string, fieldKey: string): Promise<TrackEvent> {
    return instanceTrackEvent(site, 'updated', 'issue', { actionSubjectId: issueKey, attributes: { fieldName: fieldName, fieldKey: fieldKey } });
}

export async function startIssueCreationEvent(source: string): Promise<TrackEvent> {
    return trackEvent('createFromSource', 'issue', { attributes: { source: source, hostProduct: ProductJira.name } });
}

// Bitbucket issue events

export async function bbIssueCreatedEvent(site: DetailedSiteInfo): Promise<TrackEvent> {
    return instanceTrackEvent(site, 'created', 'bbIssue');
}

export async function bbIssueTransitionedEvent(site: DetailedSiteInfo): Promise<TrackEvent> {
    return instanceTrackEvent(site, 'transitioned', 'bbIssue');
}

export async function bbIssueUrlCopiedEvent(): Promise<TrackEvent> {
    return trackEvent('copied', 'bbIssueUrl');
}

export async function bbIssueCommentEvent(site: DetailedSiteInfo): Promise<TrackEvent> {
    return instanceTrackEvent(site, 'created', 'bbIssueComment');
}

export async function bbIssueWorkStartedEvent(site: DetailedSiteInfo): Promise<TrackEvent> {
    return instanceTrackEvent(site, 'workStarted', 'bbIssue');
}

// PR events

export async function prCreatedEvent(site: DetailedSiteInfo): Promise<TrackEvent> {
    return instanceTrackEvent(site, 'created', 'pullRequest');
}

export async function prCommentEvent(site: DetailedSiteInfo): Promise<TrackEvent> {
    return instanceTrackEvent(site, 'created', 'pullRequestComment');
}

export async function prCheckoutEvent(site: DetailedSiteInfo): Promise<TrackEvent> {
    return instanceTrackEvent(site, 'checkedOut', 'pullRequestBranch');
}

export async function prApproveEvent(site: DetailedSiteInfo): Promise<TrackEvent> {
    return instanceTrackEvent(site, 'approved', 'pullRequest');
}

export async function prMergeEvent(site: DetailedSiteInfo): Promise<TrackEvent> {
    return instanceTrackEvent(site, 'merged', 'pullRequest');
}

export async function prUrlCopiedEvent(): Promise<TrackEvent> {
    return trackEvent('copied', 'pullRequestUrl');
}

// Misc Track Events

export async function customJQLCreatedEvent(site: DetailedSiteInfo): Promise<TrackEvent> {
    return instanceTrackEvent(site, 'created', 'customJql');
}

export async function pipelineStartEvent(site: DetailedSiteInfo): Promise<TrackEvent> {
    // apprently never called
    return instanceTrackEvent(site, 'start', 'pipeline');
}

export async function pmfSubmitted(level: string): Promise<TrackEvent> {
    return trackEvent('submitted', 'atlascodePmf', { attributes: { level: level } });
}

export async function pmfSnoozed(): Promise<TrackEvent> {
    return trackEvent('snoozed', 'atlascodePmf');
}

export async function pmfClosed(): Promise<TrackEvent> {
    return trackEvent('closed', 'atlascodePmf');
}

// Screen Events

export async function viewScreenEvent(screenName: string, site?: DetailedSiteInfo, product?: Product): Promise<ScreenEvent> {
    let screenEvent = instanceType({
        origin: 'desktop',
        platform: AnalyticsPlatform.for(process.platform),
    }, site, product);

    if (screenName === 'atlascodeWelcomeScreen') {
        screenEvent = excludeFromActivity(screenEvent);
    }

    const e = {
        tenantIdType: null,
        name: screenName,
        screenEvent: screenEvent
    };

    const tenantId: string | undefined = (site) ? site.id : undefined;

    return anyUserOrAnonymous<ScreenEvent>(tenantOrNull<ScreenEvent>(e, tenantId));
}

// UI Events

export async function bbIssuesPaginationEvent(): Promise<UIEvent> {
    const e = {
        tenantIdType: null,
        uiEvent: {
            origin: 'desktop',
            platform: AnalyticsPlatform.for(process.platform),
            action: 'clicked',
            actionSubject: 'button',
            source: 'vscode',
            containerType: 'treeview',
            containerId: BitbucketIssuesTreeViewId,
            objectType: 'treenode',
            objectId: 'paginationNode'
        }
    };

    return anyUserOrAnonymous<UIEvent>(e);
}

export async function prPaginationEvent(): Promise<UIEvent> {
    const e = {
        tenantIdType: null,
        uiEvent: {
            origin: 'desktop',
            platform: AnalyticsPlatform.for(process.platform),
            action: 'clicked',
            actionSubject: 'button',
            source: 'vscode',
            containerType: 'treeview',
            containerId: PullRequestTreeViewId,
            objectType: 'treenode',
            objectId: 'paginationNode'
        }
    };

    return anyUserOrAnonymous<UIEvent>(e);
}

export async function authenticateButtonEvent(source: string): Promise<UIEvent> {
    const e = {
        tenantIdType: null,
        uiEvent: {
            origin: 'desktop',
            platform: AnalyticsPlatform.for(process.platform),
            action: 'clicked',
            actionSubject: 'button',
            actionSubjectId: 'authenticateButton',
            source: source
        }
    };

    return anyUserOrAnonymous<UIEvent>(e);
}

export async function logoutButtonEvent(source: string): Promise<UIEvent> {
    const e = {
        tenantIdType: null,
        uiEvent: {
            origin: 'desktop',
            platform: AnalyticsPlatform.for(process.platform),
            action: 'clicked',
            actionSubject: 'button',
            actionSubjectId: 'logoutButton',
            source: source
        }
    };

    return anyUserOrAnonymous<UIEvent>(e);
}

// Helper methods

async function instanceTrackEvent(site: DetailedSiteInfo, action: string, actionSubject: string, eventProps: any = {}): Promise<TrackEvent> {

    let event: TrackEvent = (site.isCloud && site.product.key === ProductJira.key) ?
        await tenantTrackEvent(site.id, action, actionSubject, instanceType(eventProps, site))
        : await trackEvent(action, actionSubject, instanceType(eventProps, site));

    return event;
}

async function trackEvent(action: string, actionSubject: string, eventProps: any = {}): Promise<TrackEvent> {
    const e = {
        tenantIdType: null,
        trackEvent: event(action, actionSubject, eventProps)
    };

    return anyUserOrAnonymous<TrackEvent>(e);
}

async function tenantTrackEvent(tenentId: string, action: string, actionSubject: string, eventProps: any = {}): Promise<TrackEvent> {
    const e = {
        tenantIdType: 'cloudId',
        tenantId: tenentId,
        trackEvent: event(action, actionSubject, eventProps)
    };

    return anyUserOrAnonymous<TrackEvent>(e);
}

function event(action: string, actionSubject: string, attributes: any): any {
    var event = {
        origin: 'desktop',
        platform: AnalyticsPlatform.for(process.platform),
        action: action,
        actionSubject: actionSubject,
        source: 'vscode'
    };
    return Object.assign(event, attributes);
}

function anyUserOrAnonymous<T>(e: Object): T {
    let newObj: Object;
    const aaid = Container.siteManager.getFirstAAID();

    if (aaid) {
        newObj = { ...e, ...{ userId: aaid, userIdType: 'atlassianAccount' } };
    } else {
        newObj = { ...e, ...{ anonymousId: Container.machineId } };
    }

    return newObj as T;
}

function tenantOrNull<T>(e: Object, tenantId?: string): T {
    let tenantType: string | null = 'cloudId';
    let newObj: Object;

    if (!tenantId) {
        tenantType = null;
    }
    newObj = { ...e, ...{ tenantIdType: tenantType, tenantId: tenantId } };

    return newObj as T;
}

function instanceType(eventProps: Object, site?: DetailedSiteInfo, product?: Product): Object {
    let attrs: Object | undefined = undefined;
    let newObj = eventProps;

    if (product) {
        attrs = { hostProduct: product.name };
    }

    if (site && !isEmptySiteInfo(site)) {
        const instanceType: string = site.isCloud ? 'cloud' : 'server';
        attrs = { instanceType: instanceType, hostProduct: site.product.name };
    }

    if (attrs) {
        newObj['attributes'] = { ...newObj['attributes'], ...attrs };
    }

    return newObj;

}

function excludeFromActivity(eventProps: Object): Object {
    let newObj = eventProps;

    if (newObj['attributes']) {
        newObj['attributes'] = { ...newObj['attributes'], ...{ excludeFromActivity: true } };
    } else {
        Object.assign(newObj, { attributes: { excludeFromActivity: true } });
    }
    return newObj;
}
