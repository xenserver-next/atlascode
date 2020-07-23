import { Avatar, Badge, Box, CircularProgress, Grid, Tooltip, Typography } from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import { AvatarGroup } from '@material-ui/lab';
import React, { useCallback, useEffect, useState } from 'react';
import { BitbucketSite, Reviewer, User } from '../../../bitbucket/model';
import { AddReviewers } from './AddReviewers';
type ReviewersProps = {
    site: BitbucketSite;
    onUpdateReviewers: (reviewers: User[]) => Promise<void>;
    participants: Reviewer[];
};
export const Reviewers: React.FunctionComponent<ReviewersProps> = ({ site, onUpdateReviewers, participants }) => {
    const [activeParticipants, setActiveParticipants] = useState<Reviewer[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    const handleUpdateReviewers = useCallback(
        async (newReviewers: User[]) => {
            setIsLoading(true);
            await onUpdateReviewers(newReviewers);
        },
        [onUpdateReviewers]
    );

    useEffect(() => {
        setIsLoading(false);
    }, [participants]);

    useEffect(() => {
        setActiveParticipants(
            participants // always show reviewers & show non-reviewers if they have approved or marked needs work
                .filter((p) => p.status !== 'UNAPPROVED' || p.role === 'REVIEWER')
                .sort((a, b) => (a.status < b.status ? 0 : 1))
        );
    }, [participants]);

    return (
        <Grid container direction="row">
            <Grid item>
                {activeParticipants.length === 0 ? (
                    <Typography variant="body2">No reviewers!</Typography>
                ) : (
                    <AvatarGroup max={5}>
                        {activeParticipants.map((participant) => (
                            <Badge
                                style={{ borderWidth: '0px' }}
                                overlap="circle"
                                anchorOrigin={{
                                    vertical: 'top',
                                    horizontal: 'right',
                                }}
                                invisible={participant.status !== 'APPROVED'}
                                key={participant.accountId}
                                badgeContent={
                                    <Tooltip title="Approved">
                                        <Box bgcolor={'white'} borderRadius={'100%'}>
                                            <CheckCircleIcon fontSize={'small'} htmlColor={'#07b82b'} />
                                        </Box>
                                    </Tooltip>
                                }
                            >
                                <Tooltip title={participant.displayName}>
                                    <Avatar alt={participant.displayName} src={participant.avatarUrl} />
                                </Tooltip>
                            </Badge>
                        ))}
                    </AvatarGroup>
                )}
                {isLoading && <CircularProgress color="inherit" size={20} />}
            </Grid>

            <Grid item>
                <AddReviewers site={site} reviewers={activeParticipants} updateReviewers={handleUpdateReviewers} />
            </Grid>
        </Grid>
    );
};
