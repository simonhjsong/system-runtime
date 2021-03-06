/*
 * System Runtime
 * 
 * https://designfirst.io/systemruntime/
 * 
 * Copyright 2017 Erwan Carriou
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * This module manages the workflow of System Runtime. It behaves like a workflow engine. <br>
 * It checks if the change of status of a component is valid to be executed. By valid, it means that:<br>
 * - the state is valid for the component, <br>
 * - the input (i.e. parameters) of all actions for the state are compliants with the model and <br>
 * - the output of all actions are compliants with the model. <br>
 * 
 * If an error occurs, the workflow will call the error state of the component and runtime. <br>
 * If the error can break the consistency of the current system, the worklow will stop.
 * 
 * @module workflow
 * @requires metamodel
 * @requires component
 * @requires behavior
 * @requires channel
 * @requires state
 * @requires helper
 * @requires log
 * @requires db
 * @class workflow 
 * @static
 */

'use strict';

var $metamodel = require('./metamodel.js');
var $component = require('./component.js');
var $behavior = require('./behavior.js');
var $state = require('./state.js');
var $helper = require('./helper.js');
var $log = require('./log.js');
var $db = require('./db.js');


/* Private methods */


/**
 * The RuntimeError class.
 * @class RuntimeError
 * @constructor
 * @param {String} message message of the error
 */
function RuntimeError(message) {
  this.message = message;
  this.name = 'RuntimeError';
}
RuntimeError.prototype = new Error();
RuntimeError.prototype.constructor = RuntimeError;


/*
 * Is the value a model path.
 * @method isModelPath
 * @param {String} value
 * @return {Boolean}
 * @private
 */
function isModelPath(value) {
  return value.indexOf('.') !== -1;
}


/*
 * Get all the names of the parameter of a method.
 * @method getParamNames
 * @param {String} id id of the class
 * @param {String} methodName name of the method
 * @return {Array} the names of all parameters of the method for the class
 * @private
 */
function getParamNames(id, methodName) {
  var method = null,
    params = [],
    result = [],
    length = 0,
    i = 0;

  if ($metamodel.getModel(id)) {
    method = $metamodel.getModel(id)[methodName];
  } else {
    $log.unknownModel(id);
  }

  if (method) {
    params = method.params;
    if (params) {
      length = params.length;
      for (i = 0; i < length; i++) {
        result.push(params[i].name);
      }
    }
  } else {
    if (!isModelPath(methodName)) {
      $log.unknownMethod(id, methodName);
    }
  }
  return result;
}


/* 
 * Get the number of parameters of a method.
 * @method getParamNumber
 * @param {String} id id of the class
 * @param {String} methodName name of the method
 * @return {Array} number of parameters min and max for the method
 * @private
 */
function getParamNumber(id, methodName) {
  var method = null,
    params = [],
    result = [],
    length = 0,
    i = 0,
    min = 0,
    max = 0;

  if ($metamodel.getModel(id)) {
    method = $metamodel.getModel(id)[methodName];
  } else {
    $log.unknownModel(id);
  }

  if (method) {
    params = method.params;
    if (params) {
      length = params.length;
      for (i = 0; i < length; i++) {
        if (typeof params[i].mandatory === 'undefined' || params[i].mandatory === true) {
          min = min + 1;
        }
        max = max + 1;
      }
    }
    result.push(min);
    result.push(max);
  } else {
    $log.unknownMethod(id, methodName);
  }
  return result;
}


/* 
 * Set the default value of the non mandatory parameters of a method.
 * @method setDefaultValue
 * @param {String} id id of the class
 * @param {String} methodName name of the method
 * @param {Array} args arguments
 * @return {Array} arguments with default values
 * @private
 */
function setDefaultValue(id, methodName, args) {
  var method = null,
    params = [],
    result = [],
    length = 0,
    i = 0;

  method = $metamodel.getModel(id)[methodName];
  if (method) {
    params = method.params;
    if (params) {
      length = params.length;
      for (i = 0; i < length; i++) {
        if (params[i].mandatory === false && typeof args[i] === 'undefined') {
          result.push(params[i].default);
        } else {
          result.push(args[i]);
        }
      }
    }
  } else {
    $log.unknownMethod(id, methodName);
  }
  return result;
}


/*
 * Get the type returned by a method.
 * @method getReturnType
 * @param {String} id id of the class
 * @param {String} methodName name of the method
 * @return {String} the type returned by the method
 * @private
 */
function getReturnType(id, methodName) {
  var resultType = null,
    result = null;

  if ($metamodel.getModel(id)) {
    resultType = $metamodel.getModel(id)[methodName].result;
  } else {
    $log.unknownModel(id);
  }

  if (resultType) {
    result = resultType;
  }
  return result;
}


/*
 * Get all the type of the parameters of a method
 * @method getParamTypes
 * @param {String} id id of the class
 * @param {String} methodName name of the method
 * @return {Array} the types of the parameters of a method
 * @private
 */
function getParamTypes(id, methodName) {
  var method = null,
    params = [],
    result = [],
    length = 0,
    i = 0;

  if ($metamodel.getModel(id)) {
    method = $metamodel.getModel(id)[methodName];
  } else {
    $log.unknownModel(id);
  }

  if (method) {
    params = method.params;
    if (params) {
      length = params.length;
      for (i = 0; i < length; i++) {
        result.push(params[i].type);
      }
    }
  } else {
    $log.unknownMethod(id, methodName);
  }
  return result;
}


/*
 * Check if conditions on output are compliant with the metamodel
 * @method checkResult
 * @param {Object} params
 * @return {Boolean} true if conditions on ouput are compliant with the metamodel
 * @private
 */
function checkResult(params) {
  params = params || {};

  var component = params.component || null,
    methodName = params.methodName || '',
    methodResult = null,
    typeofMethodResult = '',
    componentClassName = '',
    returnType = null,
    result = true;

  if (typeof params.methodResult !== 'undefined') {
    methodResult = params.methodResult;
  } else {
    methodResult = undefined;
  }

  if (component.constructor.name === 'Function') {
    componentClassName = component.name;
  } else {
    componentClassName = component.constructor.name;
  }

  returnType = getReturnType(componentClassName, methodName);

  if (returnType !== null) {
    switch (true) {
      case returnType === 'any':
        break;
      case returnType === 'array':
        if (!Array.isArray(methodResult)) {
          result = false;
          $log.invalidResultType(component.id(), component.constructor.name, methodName, returnType, null);
        }
        break;
      case $metamodel.isClassName(returnType):
        if (methodResult.constructor) {
          if (methodResult.constructor.name === 'Function') {
            typeofMethodResult = methodResult.name;
          } else {
            typeofMethodResult = methodResult.constructor.name;
          }
          if (typeofMethodResult !== returnType.replace('@', '')) {
            result = false;
            $log.invalidResultType(component.id(), component.constructor.name, methodName, returnType, typeofMethodResult);
          }
        } else {
          result = false;
          $log.invalidResultType(component.id(), component.constructor.name, methodName, returnType, typeof methodResult);
        }
        break;
      default:
        if (typeof methodResult !== returnType) {
          result = false;
          $log.invalidResultType(component.id(), component.constructor.name, methodName, returnType, typeof methodResult);
        }
        break;
    }
  }

  return result;
}


/*
 * Get the actions of the specified state
 * @method getActions
 * @param {Object} component a System Runtime component
 * @param {String} name name of the state
 * @param {Boolean} isEvent true if the state is an event
 * @return {Array} list of the actions
 * @private
 */
function getActions(component, name, isEvent) {
  var action = $behavior.getActions(component.id(), name),
    parents = [],
    length = 0,
    i = 0,
    parent = null;

  if (!action.length || isEvent) {
    if (component.constructor.name !== 'Function') {
      action = action.concat(getActions($component.get(component.constructor.name), name, isEvent));
    } else {
      parents = $metamodel.getParents(component.name);
      length = parents.length;
      for (i = 0; i < length; i++) {
        parent = $component.get(parents[i]);
        if (parent) {
          action = action.concat(getActions(parent, name, isEvent));
        } else {
          $log.unknownComponent(parents[i], component.name);
        }
        if (action.length) {
          break;
        }
      }
    }
  }

  if (action.length) {
    action.reverse();
  }

  return action;
}


/*
 * Call an action and make some Dependency Injection if it is a core action
 * @method callAction
 * @param {Component} component
 * @param {String} state name of the state
 * @param {Object} action action
 * @param {Array} params parameters of the action
 * @param {Boolean} isEvent is the action a callback of an event
 * @return {Boolean} result of the action
 */
function callAction(component, state, action, params, isEvent) {
  var result = null,
    injectedParams = [],
    componentClassName = '',
    i = 0,
    length = 0;

  if (component.constructor.name === 'Function') {
    componentClassName = component.name;
  } else {
    componentClassName = component.constructor.name;
  }

  if (!$metamodel.isProperty(state, componentClassName) && !$metamodel.isLink(state, componentClassName) && !$metamodel.isCollection(state, componentClassName)) {
    params = setDefaultValue(componentClassName, state, params);
  }

  try {
    length = params.length;
    for (i = 0; i < length; i++) {
      injectedParams.push(params[i]);
    }
    if (action.useCoreAPI) {
      injectedParams.push($component);
      injectedParams.push($db);
      injectedParams.push($metamodel);
      injectedParams.push(exports);
      injectedParams.push($behavior);
      injectedParams.push($state);
      injectedParams.push($log);
    }

    if (isEvent) {
      setTimeout(action.action.bind.apply(action.action, [component].concat(injectedParams)), 0);
    } else {
      result = action.action.apply(component, injectedParams);
    }
  } catch (e) {
    if (e instanceof RuntimeError) {
      throw e;
    } else {
      /* jshint -W054 */
      if (new Function() === undefined) {
        /* jshint +W054 */
        console.error('runtime: can not execute new Function() instruction in the current context.');
      } else {
        if (component && component.error) {
          component.error({
            'message': "error when trying to call the method '" + state + "' on component '" + component.id() + "'",
            "error": e
          });
        }
        if ($helper.getRuntime()) {
          $helper.getRuntime().error({
            "message": "error when trying to call the method '" + state + "' on component '" + component.id() + "'",
            'error': e
          });
        }
        $log.actionInvokeError(state, component.id(), component.constructor.name, e.message);
      }
    }
  }

  return result;
}


/* Public methods */


/*
 * Check if an action has the valid number of parameter.
 * @method validParamNumbers
 * @param {String} className name the class
 * @param {String} state state on which the action applied
 * @param {Function} action action
 * @return {Boolean} true if the action is the valid number of parameters
 */
function validParamNumbers(className, state, action) {
  var func = '',
    beginBody = -1,
    header = '',
    funcParams = '',
    params = [],
    paramNumber = 0,
    modelNumberParam = [],
    isProperty = false,
    isLink = false,
    isCollection = false,
    result = false;

  // check number of parameters of the action
  func = action.toString();
  beginBody = func.indexOf('{');
  header = func.substring(0, beginBody);
  header = header.replace('=>', '');

  if (header.indexOf('(') !== -1) {
    funcParams = header.split('(')[1].replace(')', '').trim();
  } else {
    funcParams = header.trim();
  }

  params = funcParams.split(',');
  if (params[0] === '') {
    params = [];
  }
  paramNumber = params.length;

  // get the number min and max of valid parameters
  isProperty = $metamodel.isProperty(state, className);
  isLink = $metamodel.isLink(state, className);
  isCollection = $metamodel.isCollection(state, className);

  switch (true) {
    case isCollection:
      modelNumberParam = [2, 2];
      break;
    case isProperty:
      if ($metamodel.getModelPathType(className, state) === 'array') {
        modelNumberParam = [2, 2];
      } else {
        modelNumberParam = [1, 1];
      }
      break;
    case isLink:
      modelNumberParam = [1, 1];
      break;
    default:
      modelNumberParam = getParamNumber(className, state);
      break;
  }

  // compare
  if (modelNumberParam[0] <= paramNumber && paramNumber <= modelNumberParam[1]) {
    result = true;
  }

  return result;
}


/*
 * Check if conditions on input are compliant with the model before calling the action.
 * @method checkParams
 * @param {Object} params
 * @return {Boolean} true if condition on input are compliant with the model
 */
function checkParams(params) {
  params = params || {};

  var component = params.component || null,
    methodName = params.methodName || '',
    args = params.args || '',
    paramsName = [],
    paramsType = [],
    paramsNumber = [],
    componentClassName = '',
    length = args.length,
    i = 0,
    param = null,
    result = true,
    isProperty = false,
    isLink = false,
    isCollection = false;

  if (component.constructor.name === 'Function') {
    componentClassName = component.name;
  } else {
    componentClassName = component.constructor.name;
  }

  isProperty = $metamodel.isProperty(methodName, componentClassName);
  isLink = $metamodel.isLink(methodName, componentClassName);
  isCollection = $metamodel.isCollection(methodName, componentClassName);
  paramsName = getParamNames(componentClassName, methodName);

  switch (true) {
    case isCollection:
      if (args && args[1] && args[1] === 'reset') {
        paramsType = [[$metamodel.getModel(componentClassName)[methodName].type[0]], 'string'];
      } else {
        paramsType = [$metamodel.getModel(componentClassName)[methodName].type[0], 'string'];
      }
      paramsNumber = [2, 2];
      break;
    case isProperty:
      if (isModelPath(methodName)) {
        paramsType = [$metamodel.getModelPathType(componentClassName, methodName)];
      } else {
        paramsType = [$metamodel.getModel(componentClassName)[methodName].type];
      }
      if ($metamodel.getModelPathType(componentClassName, methodName) === 'array') {
        if (args && args[1] && args[1] === 'reset') {
          paramsType = [['any'], 'string'];
        } else {
          paramsType = ['any', 'string'];
        }
        paramsNumber = [2, 2];
      } else {
        paramsNumber = [1, 1];
      }
      break;
    case isLink:
      paramsType = [$metamodel.getModel(componentClassName)[methodName].type];
      paramsNumber = [1, 1];
      break;
    default:
      paramsType = getParamTypes(componentClassName, methodName);
      paramsNumber = getParamNumber(componentClassName, methodName);
      break;
  }

  // case of object
  if (typeof length === 'undefined') {
    length = 1;
  }

  if (length < paramsNumber[0] || paramsNumber[1] < length) {
    result = false;
    $log.invalidParamNumber(component.id(), component.constructor.name, methodName);
  }

  for (i = 0; i < length; i++) {
    param = args[i];
    if (typeof param === 'undefined') {
      if (i < paramsNumber[0]) {
        result = false;
        $log.invalidParamNumber(component.id(), component.constructor.name, methodName);
      } else {
        continue;
      }
    } else {
      if (!$metamodel.isValidType(param, paramsType[i])) {
        result = false;
        $log.invalidParamType(component.id(), component.constructor.name, methodName, paramsName[i]);
      }
    }
  }

  return result;
}


/*
 * Call an action that comes from an event.
 * @method action
 * @param {String} behaviorId id of the behavior
 * @param {Array} params parameters
 */
function action(behaviorId, params) {
  var isEvent = false,
    isProperty = false,
    isLink = false,
    isCollection = false,
    behaviors = [],
    behavior = null,
    component = null,
    componentClassName = '',
    actionFromMemory = null;

  behaviors = $db._Behavior.find({
    '_id': behaviorId
  });

  actionFromMemory = $behavior.get(behaviorId);

  if (behaviors.length === 1) {
    behavior = behaviors[0];

    component = $component.get(behavior.component);
    if (component) {

      if (component.constructor.name === 'Function') {
        componentClassName = component.name;
      } else {
        componentClassName = component.constructor.name;
      }

      isEvent = $metamodel.isEvent(behavior.state, componentClassName);
      isProperty = $metamodel.isProperty(behavior.state, componentClassName);
      isLink = $metamodel.isLink(behavior.state, componentClassName);
      isCollection = $metamodel.isCollection(behavior.state, componentClassName);

      if (isEvent || isProperty || isCollection || isLink) {
        callAction(component, behavior.state, {
          'useCoreAPI': behavior.useCoreAPI,
          'action': actionFromMemory
        }, params, true);
      }
    }
  }
}


/*
 * Change the state of a component.
 * 
 * Worklow:<br>
 * <br>
 * 0. Check if the component has not been destroyed <br>
 * 1. Check if the state is a method, a property or an event <br>
 * 2. Search if there is a behavior with actions for the new state <br>
 * 3. If so, get the action(s) <br>
 * 4. Check if the inputs are compliants with the metamodel <br>
 * 5. Call the action(s) <br>
 * 6. If a method, check if the output are compliants with the metamodel <br>
 * 7. If all is ok, the state of the component is updated <br>
 * 8. Return the result <br>
 * 
 * @method state
 * @param {Object} params params to change the state <br>
 * {String} component id of the component <br>
 * {String} state state of the component <br>
 * {Array} data parameters to send to the action
 */
function state(params) {

  params = params || {};
  params.component = params.component || '';
  params.state = params.state || '';
  params.data = params.data || [];
  params.context = params.context || null;

  var component = null,
    currentState = '',
    actions = [],
    action = null,
    result = null,
    i = 0,
    length = 0,
    componentClassName = false,
    isProperty = false,
    isLink = false,
    isCollection = false,
    isEvent = false;

  currentState = $state.get(params.component);

  if (currentState && currentState.state === 'destroy') {
    $log.invalidUseOfComponent(params.component);
  }

  component = $component.get(params.component);
  if (component) {

    if (component.constructor.name === 'Function') {
      componentClassName = component.name;
    } else {
      componentClassName = component.constructor.name;
    }
    isEvent = $metamodel.isEvent(params.state, componentClassName);
    isProperty = $metamodel.isProperty(params.state, componentClassName);
    isLink = $metamodel.isLink(params.state, componentClassName);
    isCollection = $metamodel.isCollection(params.state, componentClassName);
    actions = getActions(component, params.state, isEvent);
  }

  if (actions.length) {

    if (checkParams({
      'component': component,
      'methodName': params.state,
      'args': params.data
    })) {

      if (!isEvent &&
        !isProperty &&
        !isLink &&
        !isCollection) {
        action = actions[0];
        result = callAction(params.context || component, params.state, action, params.data, false);

        checkResult({
          'component': component,
          'methodName': params.state,
          'methodResult': result
        });

      } else {

        length = actions.length;
        for (i = 0; i < length; i++) {
          action = actions[i];
          callAction(params.context || component, params.state, action, params.data, true);
        }

        $state.set(component.id(), params.state, params.data);
      }
    }
    return result;
  } else {
    if (component && (isEvent || isProperty || isLink || isCollection)) {
      $state.set(component.id(), params.state, params.data);
    }
  }
}


/*
 * Stop the workflow engine.
 * @method stop
 * @param {Object} params parameters <br>
 * {Boolean} error true if the stop of the workflow is due to an error (default false) <br>
 * {String} message error message to log (default '')
 */
function stop(params) {
  params = params || {};

  if (typeof params.error === 'undefined') {
    params.error = false;
  }
  params.message = params.message || '';

  exports.state = function () {
  };

  if (params.error) {
    if (params.message) {
      throw new RuntimeError('runtime has been stopped because ' + params.message);
    } else {
      throw new RuntimeError('runtime has been stopped because of an unknown error');
    }
  } else {
    if (params.message) {
      console.error('runtime: runtime has been stopped because ' + params.message);
    } else {
      console.error('runtime: runtime has been stopped');
    }
  }
}


/*
 * Restart the workflow engine from the last state.
 * @method restart
 */
function restart() {
  exports.state = state;
  $log.workflowRestarted();
}


/* exports */


/**
 * This module manages the workflow of System Runtime. It behaves like a workflow engine. <br>
 * It checks if the change of status of a component is valid to be executed. By valid, it means that:<br>
 * - the state is valid for the component, <br>
 * - the input (i.e. parameters) of all actions for the state are compliants with the model and <br>
 * - the output of all actions are compliants with the model. <br>
 * 
 * If an error occurs, the workflow will call the error state of the component and of System Runtime instance. <br>
 * If the error can break the consistency of the current system, the worklow will stop.
 * 
 * @module workflow
 * @requires metamodel
 * @requires component
 * @requires behavior
 * @requires channel
 * @requires state
 * @requires helper
 * @requires log
 * @requires db
 * @class workflow 
 * @static
 */


/**
 * Change the state of a component.
 * 
 * Worklow:<br>
 * <br>
 * 0. Check if the component has not been destroyed <br>
 * 1. Check if the state is a method or an event <br>
 * 2. Search if there is a behavior with an action for the new state <br>
 * 3. If so, get the action(s) <br>
 * 4. Check if the conditons on input are compliant with the metamodel <br>
 * 5. Call the action(s) <br>
 * 6. If not an of event, check if the conditons on input are compliant with the metamodel <br>
 * 7. If all is ok, the state of the component is updated <br>
 * 8. Return the result <br>
 * 
 * @method state
 * @param {Object} params params to change the state <br>
 * {String} component id of the component <br>
 * {String} state state of the component <br>
 * {Array} data parameters to send to the action
 */
exports.state = state;


/**
 * Stop the workflow engine.
 * @method stop
 * @param {Object} params parameters <br>
 * {Boolean} error true if the stop of the workflow is due to an error (default false) <br>
 * {String} message error message to log (default '')
 */
exports.stop = stop;


/**
 * Restart the workflow engine from the last state.
 * @method restart
 */
exports.restart = restart;


/**
 * Check if conditions on input are compliant with the model before calling the action.
 * @method checkParams
 * @param {Object} params
 * @return {Boolean} true if condition on input are compliant with the model
 */
exports.checkParams = checkParams;


/**
 * Check if an action has the valid number of parameter.
 * @method validParamNumbers
 * @param {String} className name the class
 * @param {String} state state on which the action applied
 * @param {Function} action action
 * @return {Boolean} true if the action is the valid number of parameters
 */
exports.validParamNumbers = validParamNumbers;


/**
 * Call an action that comes from an event.
 * @method action
 * @param {String} behaviorId id of the behavior
 * @param {Array} params parameters
 */
exports.action = action;