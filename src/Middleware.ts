import * as Redux from 'redux';
import { ITrackHistoryState, IJsonDiff, IStoreEnhancer, IReduxCreateStore, ITrackHistoryStoreEnhancer } from './ITypes';
let jsonDiffPatch: IJsonDiff = require('jsondiffpatch');

let initialState: ITrackHistoryState = {
  stateHistory: {
    history: [],
    timestamps: [],
    actions: [],
    current: -1,
  }
};

function calculateDiff(lhs, rhs, removeKeys = []) {
  const lhsClone = Object.assign({}, lhs);
  const rhsClone = Object.assign({}, rhs);

  removeKeys.forEach(key => { delete lhsClone[key]; delete rhsClone[key]; });

  return jsonDiffPatch.diff(lhsClone, rhsClone);
}

/**
 * Store enhancer that adds state history (stored within the state)
 */
const trackHistoryStoreEnhancer: ITrackHistoryStoreEnhancer =
  (hydratingState = initialState) =>
    (createStore: IReduxCreateStore) =>
      (reducer: Redux.Reducer, state = hydratingState) => createStore(trackReducerChanges(reducer, state));

/**
 * Higher-order reducer-wrapper to log all state changes generated by said reducer
 *
 * TODO: When hydrateState is passed, we replace the history state by the given one after the first reducer has run
 */
function trackReducerChanges(reducer, hydrateState: ITrackHistoryState = initialState): Redux.Reducer {

  return function(state = hydrateState, action) {

    // Compute new state after applying reducer
    const newAppState: ITrackHistoryState = reducer(state, action);

    // Nothing to do if the two states match (by reference)
    if (state === newAppState) {
      return newAppState;
    }

    // Do nothing if the action has special flagged (used by debug tools)
    // Instead of this we could compare to see if the state is unchanged on the non-tracking part, but this might be too expensive
    if (action.meta === 'SKIP_HISTORY_TRACKING') {
      return newAppState;
    }

    // Calculate the delta of the state (ignoring the stateHistory key)
    const delta = calculateDiff(newAppState, state, ['stateHistory']);

    // Do nothing if delta is null
    if (typeof delta === 'undefined') {
      return newAppState;
    }

    // Update the newAppState
    // Note: The only way to do this properly is to use an immutable library like ImmutableJS that will do a complete recursive deep
    //       cloning of the history field. However, for our purposes as long as we shallow clone history we are fine because nothing
    //       will write to its subproperties
    const clonedState = Object.assign({}, newAppState, {
      stateHistory: Object.assign({}, newAppState.stateHistory, {
        history: Object.assign([], newAppState.stateHistory.history),
        timestamps: Object.assign([], newAppState.stateHistory.timestamps),
        actions: Object.assign([], newAppState.stateHistory.actions),
        current: newAppState.stateHistory.current
      })
    });

    clonedState.stateHistory.history.push(delta);
    clonedState.stateHistory.timestamps.push(Date.now());
    clonedState.stateHistory.actions.push(action.type);
    clonedState.stateHistory.current++;

    return clonedState;
  };
}

export default trackHistoryStoreEnhancer;
