import { ReducerAction } from '@atlassianlabs/guipi-core-controller';
import { emptyIssueType, emptyProject, Project } from '@atlassianlabs/jira-pi-common-models';
import { CreateMetaTransformerResult } from '@atlassianlabs/jira-pi-meta-models';
import { DetailedSiteInfo, emptySiteInfo } from '../../../atlclients/authInfo';

export enum CreateJiraIssueMessageType {
    Init = 'init',
}

export type CreateJiraIssueMessage = ReducerAction<CreateJiraIssueMessageType.Init, CreateJiraIssueInitMessage>;

export type CreateJiraIssueResponse = {};

export interface CreateJiraIssueInitMessage {
    site: DetailedSiteInfo;
    project: Project;
    screenData: CreateMetaTransformerResult<DetailedSiteInfo>;
}

export const emptyCreateJiraIssueInitMessage: CreateJiraIssueInitMessage = {
    site: emptySiteInfo,
    project: emptyProject,
    screenData: {
        issueTypes: [],
        selectedIssueType: emptyIssueType,
        issueTypeUIs: {},
        problems: {},
    },
};