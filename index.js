exports.reduceUI = (state, action) => {
  switch (action.type) {
    case 'COPYCAT_TOGGLE':
      return state.set('copyCatEnabled', !state.copyCatEnabled);
    default:
      return state;
  }
}

exports.mapTermsState = (state, map) => {
  return Object.assign({}, map, {
    copyCatEnabled: state.ui.copyCatEnabled
  })
}

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

exports.getTermGroupProps = (uid, parentProps, props) => {
  return Object.assign({}, props, {toggleCopyCat: parentProps.toggleCopyCat});
}
exports.getTermProps = (uid, parentProps, props) => {
  return Object.assign({}, props, {toggleCopyCat: parentProps.toggleCopyCat});
}

exports.middleware = (store) => (next) => (action) => {
  const state = store.getState();
  if ('SESSION_PTY_DATA' === action.type) {
    if ((state.ui.copyCatEnabled) && !action.copyCatAction) {
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
      for (let uid of Object.keys(state.sessions.sessions)) {
        if (sessionUids.includes(uid)) {
          const test = Object.assign({}, action, {
            uid: uid,
            copyCatAction: true
          });
          store.dispatch(test);
        }
      }
    } else {
      next(action);
    }
  } else {
    next(action);
  }
};

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

exports.decorateTerm = (Term, { React }) => class extends React.Component {
  render() {
    return React.createElement(Term, Object.assign({}, this.props, {
      onTerminal: (term) => {
        if (this.props && this.props.onTerminal) {
          this.props.onTerminal(term);
        }

        term.uninstallKeyboard();
        const handler = (e) => {
          if (e.key === ' ' && e.shiftKey) {
            e.preventDefault();
            this.props.toggleCopyCat();
          }
        }
        term.keyboard.handlers_ = term.keyboard.handlers_.concat([
          ['keydown', handler]
        ]);
        term.installKeyboard();
      }
    }));
  }
};
