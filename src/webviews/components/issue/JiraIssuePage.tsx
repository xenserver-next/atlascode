import * as React from 'react';
import { BreadcrumbsStateless, BreadcrumbsItem } from '@atlaskit/breadcrumbs';
import DropdownMenu, { DropdownItemGroup, DropdownItem } from '@atlaskit/dropdown-menu';
import Lozenge from '@atlaskit/lozenge';
import Arrow from '@atlaskit/icon/glyph/arrow-right';
import styled from 'styled-components';
import Page, { Grid, GridColumn } from '@atlaskit/page';
import { WebviewComponent } from '../WebviewComponent';
import { IssueData } from '../../../ipc/issueMessaging';
import { Action, Alert } from '../../../ipc/messaging';
import { emptyStatus, emptyIssueType, emptyUser, emptyPriority, emptyWorkingSite } from '../../../jira/jiraModel';
import { TransitionIssueAction } from '../../../ipc/issueActions';

type Emit = TransitionIssueAction | Action | Alert;
const emptyIssueData:IssueData =  {
    type:'',
    key: '',
    id: '',
    self: '',
    description: '',
    summary: '',
    status: emptyStatus,
    priority: emptyPriority,
    issueType: emptyIssueType,
    reporter: emptyUser,
    assignee: emptyUser,
    comments: [],
    labels: [],
    attachments: [],
    transitions: [],
    workingSite: emptyWorkingSite
};

type MyState = { data: IssueData, isStatusButtonLoading: boolean };

const statusColors:Map<string,string> = new Map<string,string>([["new","default"],["indeterminate","inprogress"],["done","success"]]);
export default class JiraIssuePage extends WebviewComponent<Emit, IssueData, {},MyState> {
    
    constructor(props: any) {
        super(props);
        this.state = {data: emptyIssueData, isStatusButtonLoading: false };
    }

    componentUpdater = (data: IssueData) => { };

    public onMessageReceived(e: IssueData) {
        console.log("got message from vscode", e);
        this.state = { ...this.state, ...{ data: e, isStatusButtonLoading: false } };
        this.componentUpdater(e);
    }

    componentWillMount() {
        this.componentUpdater = (data) => { 
            const newState = { ...this.state, ...{ data: data } };
            this.setState(newState);
        };
    }

    onHandleStatusChange = (item:any) => {
        const transition = this.state.data.transitions.find(trans => trans.id === item.target.parentNode.parentNode.dataset.transitionId);

        if(transition) {
            this.setState({ ...this.state, ...{ isStatusButtonLoading: true } });
            this.postMessage({action:"transitionIssue", transition:transition, issue: this.state.data});
        }
    }

    render() {
        const issue = this.state.data;
        const JiraItem = styled.div`
        align-items: center;
        display: flex;
        `;
        if (!issue) { return <div></div>; }
        let statusItems:any[] = [];

        issue.transitions.forEach(transition => {
            if(issue.status.id !== transition.to.id){
                statusItems.push(
                    <DropdownItem
                        className='ak-dropdown-item'
                        id={transition.name}
                        data-transition-id={transition.id}
                        onClick={this.onHandleStatusChange}
                        elemAfter={
                        <JiraItem>
                            <Arrow label="" size="small" />
                            <Lozenge appearance={statusColors.get(transition.to.statusCategory.key)}>{transition.to.name}</Lozenge>
                        </JiraItem>
                        }>
                        {transition.name}
                    </DropdownItem>
                );
            }
        });

        return (
            <Page>
                <Grid>
                    <GridColumn medium={8}>
                    <BreadcrumbsStateless onExpand={() => {}}>
                        <BreadcrumbsItem text={issue.key} key={issue.key} />
                        <BreadcrumbsItem text="Parent page" key="Parent page" />
                    </BreadcrumbsStateless>
                        <h2>{issue.summary}</h2>
                        <p>{issue.description}</p>
                    </GridColumn>

                    <GridColumn medium={4}>
                        <h2>Status</h2>
                        <DropdownMenu
                            triggerType="button"
                            trigger={issue.status.name}
                            triggerButtonProps={{className:'ak-button', isLoading:this.state.isStatusButtonLoading}}
                        >
                            <DropdownItemGroup>
                               {statusItems}
                            </DropdownItemGroup>
                        </DropdownMenu>
                    </GridColumn>
                    
                </Grid>
            </Page>
        );
    }
}
