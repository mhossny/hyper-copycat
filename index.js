// we need a place to keep track of the active terminals so we can write to them later
let terminals = {};

// add an action handler for our copycat toggle
exports.reduceUI = (state, action) => {
  switch (action.type) {
    case 'COPYCAT_TOGGLE':
      return state.set('copyCatEnabled', !state.copyCatEnabled);
    default:
      return state;
  }
}

// pass our copycat flag to the terms props
exports.mapTermsState = (state, map) => {
  return Object.assign({}, map, {
    copyCatEnabled: state.ui.copyCatEnabled
  })
}

// pass an action creator to the terms props. not sure why exactly, but for some reason
// some of the keydown events (which we use to trigger the copycat action) fire multiple
// times. we'll use a throttle for now to make sure we only toggle once
let wait = false;
const toggleHandler = (dispatch) => {
  if (!wait) {
    dispatch({type: 'COPYCAT_TOGGLE'});
    wait = true;
    setTimeout(() => {
      wait = false;
    }, 100);
  }
}
exports.mapTermsDispatch = (dispatch, map) => {
  return Object.assign({}, map, {
    toggleCopyCat: () => {
      toggleHandler(dispatch);
    }
  })
}

// now pass the action creator down from the terminal group to each term
exports.getTermGroupProps = (uid, parentProps, props) => {
  return Object.assign({}, props, {toggleCopyCat: parentProps.toggleCopyCat});
}
exports.getTermProps = (uid, parentProps, props) => {
  return Object.assign({}, props, {toggleCopyCat: parentProps.toggleCopyCat});
}

// add a visual cue to let the user know when copycat is enabled
exports.decorateTerms = (Terms, { React }) => {
  class DecoratedTerms extends React.Component {
    render() {
      let customChildren = this.props.customChildren ? this.props.customChildren : [];
      if (this.props.copyCatEnabled) {
        customChildren.push(React.createElement('div', {
          id: 'test-id',
          style: {
            position: 'relative',
            top: '-30px',
            backgroundColor: 'blue'
          }
        }, 'CopyCat Enabled'));
      }
      return React.createElement(Terms, Object.assign({}, this.props, {customChildren: customChildren}));
    }
  }
  return DecoratedTerms;
}

// we need access to each terminal Component for 2 reaons
// 1. we need to listen for any keydown event. This is how we look for the keyboard
//    shortcut to fire the action creator and toggle copycat
// 2. we need to get access to the actual term object so we can write to it later
exports.decorateTerm = (Term, { React }) => class extends React.Component {
  render() {
    return React.createElement(Term, Object.assign({}, this.props, {
      onTerminal: (term) => {
        if (this.props && this.props.onTerminal) {
          this.props.onTerminal(term);
        }

        term.uninstallKeyboard();
        const handler = (e) => {
          if (e.key === 'i' && e.ctrlKey) {
            e.preventDefault();
            this.props.toggleCopyCat();
          }
        }
        term.keyboard.handlers_ = term.keyboard.handlers_.concat([
          ['keydown', handler]
        ]);
        term.installKeyboard();
        terminals[this.props.uid] = term;
      }
    }));
  }
};

// where the magic happens. essentially we'll watch for any action telling us that the user
// added data. we can then write that same data to all of the terminals in the active terminal group

// we need some way to tell what was a real user action and what was a copycat-initiated action. this
// array will keep track of a "pending" copycat initiated action to make sure not try and repeat the
// same action again
let toWrite = [];
exports.middleware = (store) => (next) => (action) => {
  const state = store.getState();
  if ('SESSION_USER_DATA' === action.type && toWrite.includes(action.data)) {
    // if this is a "pending" copycat action, we'll just continue that action and remove it from our queue
    toWrite.splice(toWrite.indexOf(action.data), 1);
    next(action);
  } else if ('SESSION_USER_DATA' === action.type) {
    // if this was a real user action, we want to get all of the terminals in the active terminal group so we
    // can forward this action to them as well
    if (state.ui.copyCatEnabled) {
      const getSessionUids = (groupUid) => {
        let uIds = [];
        if (state.termGroups.termGroups[groupUid].sessionUid) {
          uIds.push(state.termGroups.termGroups[groupUid].sessionUid);
        }
        if (state.termGroups.termGroups[groupUid].children) {
          uIds = [].concat.apply(uIds, state.termGroups.termGroups[groupUid].children.map((childGroupUid) => {
            return getSessionUids(childGroupUid);
          }));
        }
        return uIds;
      }
      const sessionUids = getSessionUids(state.termGroups.activeRootGroup);
      // once we have a list of all the terminals, we'll then add this action to our "queue" to make sure we can
      // distinguish them as copycat-initiated actions, and then actually write the data to the terminal
      for (let uid of Object.keys(state.sessions.sessions)) {
        if (sessionUids.includes(uid)) {
          toWrite.push(action.data);
          terminals[uid].io.sendString(action.data);
        }
      }
    } else {
      next(action);
    }
  } else {
    next(action);
  }
};
