import * as vscode from 'vscode';
import * as path from 'path';
import * as child from 'child_process';
import { currentUserJira } from './commands//jira/currentUser';
import { authenticateJira, clearJiraAuth, authenticateBitbucket, clearBitbucketAuth } from './commands/authenticate';
import { showProjectSelectionDialog } from './commands/jira/selectProject';
import { showSiteSelectionDialog } from './commands/jira/selectSite';
import { Container } from './container';
import { transitionIssue } from './commands/jira/transitionIssue';
import { Logger } from './logger';
import { assignIssue } from './commands/jira/assignIssue';
import { IssueNode } from './views/nodes/issueNode';

export enum Commands {
    BitbucketSelectContainer = 'atlascode.bb.selectContainer',
    BitbucketFetchPullRequests = 'atlascode.bb.fetchPullRequests',
    BitbucketRefreshPullRequests = 'atlascode.bb.refreshPullRequests',
    BitbucketShowPullRequestDetails = 'atlascode.bb.showPullRequestDetails',
    BitbucketPullRequestsNextPage = 'atlascode.bb.pullReqeustsNextPage',
    AuthenticateBitbucket = 'atlascode.bb.authenticate',
    ClearBitbucketAuth = 'atlascode.bb.clearAuth',
    CurrentUserBitbucket = 'atlascode.bb.me',
    currentUserJira = 'atlascode.jira.me',
    AuthenticateJira = 'atlascode.jira.authenticate',
    ClearJiraAuth = 'atlascode.jira.clearAuth',
    SelectProject = 'atlascode.jira.selectProject',
    SelectSite = 'atlascode.jira.selectSite',
    CreateIssue = 'atlascode.jira.createIssue',
    RefreshJiraExplorer = 'atlascode.jira.refreshExplorer',
    ShowIssue = 'atlascode.jira.showIssue',
    ShowConfigPage = 'atlascode.showConfigPage',
    ShowWelcomePage = 'atlascode.showWelcomePage',
    TransitionIssue = 'atlascode.jira.transitionIssue',
    AssignIssueToMe = 'atlascode.jira.assignIssueToMe',
    CreatePullRequest = 'atlascode.bb.createPullRequest'
}

export function registerCommands(vscodeContext: vscode.ExtensionContext) {
    vscodeContext.subscriptions.push(
        vscode.commands.registerCommand(Commands.ShowConfigPage, Container.configWebview.createOrShow, Container.configWebview),
        vscode.commands.registerCommand(Commands.ShowWelcomePage, Container.welcomeWebview.createOrShow, Container.welcomeWebview),
        vscode.commands.registerCommand(Commands.currentUserJira, currentUserJira),
        vscode.commands.registerCommand(Commands.AuthenticateJira, authenticateJira),
        vscode.commands.registerCommand(Commands.ClearJiraAuth, clearJiraAuth),
        vscode.commands.registerCommand(Commands.AuthenticateBitbucket, authenticateBitbucket),
        vscode.commands.registerCommand(Commands.ClearBitbucketAuth, clearBitbucketAuth),
        vscode.commands.registerCommand(Commands.SelectProject, showProjectSelectionDialog),
        vscode.commands.registerCommand(Commands.SelectSite, showSiteSelectionDialog),
        vscode.commands.registerCommand(Commands.CreateIssue, Container.createIssueWebview.createOrShow, Container.createIssueWebview),
        vscode.commands.registerCommand(Commands.ShowIssue, (issue: any) => {
            Logger.debug('args',issue);
            Container.jiraIssueViewManager.createOrShow(issue);
        }),
        vscode.commands.registerCommand(Commands.TransitionIssue, (issue) => transitionIssue(issue)),
        vscode.commands.registerCommand(Commands.AssignIssueToMe, (issuNode: IssueNode) => assignIssue(issuNode)),

        vscode.commands.registerCommand('todolense.showOpenProjects', () => {
        
            let command = vscodeContext.asAbsolutePath(path.join('node_modules/.bin/electron'));

            // source
            var cwd = vscodeContext.asAbsolutePath(path.join('extension-ui/'));
            
            command = command.replace(/\//g, path.sep);
            cwd = cwd.replace(/\//g, path.sep);
            
            var spawn_env = JSON.parse(JSON.stringify(process.env));
            
            // remove those env vars
            delete spawn_env.ATOM_SHELL_INTERNAL_RUN_AS_NODE;
            delete spawn_env.ELECTRON_RUN_AS_NODE;
            Logger.debug(cwd);
            Logger.debug(command);
            
            child.spawn(command, ['.'], {cwd: cwd, env: spawn_env});

            //sp.unref();
        })
    );
}
