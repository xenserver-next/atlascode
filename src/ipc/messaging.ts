// Message is the base interface for sending messages from vscode => react
// Messages must have a type so receivers can switch on it.
// Sub-interfaces should be used to carry view specific data and extend this interface.
export interface Message {
    type:string;
}

// Action is the base interface for sending messages from react => vscode
// Action must have an action so receivers can switch on it.
// Sub-interfaces should be used to carry action specific data and extend this interface.
export interface Action {
    action:string;
}

// Alert is an action with a message that should be alerted by the vscode reciever.
// The 'action' field on this action should define how to alert. e.g. 'alertError'.
export interface Alert extends Action {
    message:string;
}

// isAlertable is a function that can be used to cast an Action to an Alert in receivers.
export function isAlertable(a:Action): a is Alert {
    return (<Alert>a).message !== undefined;
}