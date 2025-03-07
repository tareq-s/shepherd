// Copyright 2013 The Obvious Corporation.

/**
 * @fileoverview The intermediate results of a graph being built.
 *
 * TODO(nick): This used to be an implementation detail of Builder.js,
 * and over time we should fix this so that Builder doesn't reach
 * into its internal state.
 */

var Q = require('kew')
var util = require('util')

/**
 * @param {Object} inputData
 * @param {Object} config
 * @param {string} builderName The builder name, for debug purposes.
 * @constructor
 */
function GraphResults(inputData, config, builderName) {
  this._numResolvedInputs = {}

  /**
   * A map from the name of a node to a value.
   */
  this._values = inputData || {}

  /**
   * A map from the hash key of a node to a value.
   * See the comments on NodeHashBuilder for why we use nonImportantHash.
   */
  this._hashedValues = {}

  /**
   * A map from the name of a node to the number of steps back we should trace.
   */
  this._traces = {}

  this._errors = {}
  this._outputDefer = Q.defer()
  this._startTimes = {}
  this._shouldProfile = config.enableProfiling && (Math.random() < config.profilingFrequency)

  /** @private {string} */
  this._builderName = builderName
}

/**
 * Generate a node context for a failure report.
 * @param {Object} node
 * @return {Object}
 */
GraphResults.prototype.getDebugContext = function (node) {
  var depNodes = []
  for (var key in node.inputs) {
    depNodes.push(node.inputs[key])
  }

  return {
    builderName: this._builderName,
    callers: node.callers,
    failureNodeChain: node.failureChain,
    failureInputs: depNodes
  }
}

/**
 * @param {Object} node
 * @param {*} result
 */
GraphResults.prototype.setNodeResult = function (node, result) {
  var nodeName = node.newName
  var isTracer = result instanceof GraphResults.Tracer
  if (isTracer) {
    var currentTrace = typeof(this._traces[nodeName]) == 'number' ?
        this._traces[nodeName] : -1
    this._traces[nodeName] = Math.max(currentTrace, result._depth)
  }

  var value =  isTracer ? result._tracedValue : result
  this._values[nodeName] = value
  this._hashedValues[node.nonImportantHash] = value
  if (this._traces[nodeName] >= 0) {
    console.log('[Trace ' + this._builderName + '] ' +
                'Resolved "' + nodeName + '" <- ' + result)
  }
}

/**
 * @param {Object} node
 * @param {*} error
 */
GraphResults.prototype.setNodeError = function (node, error) {
  var nodeName = node.newName
  this._errors[nodeName] = error
}

/**
 * @param {string} nodeName
 * @return {boolean}
 */
GraphResults.prototype.hasResult = function (nodeName) {
  return this._values.hasOwnProperty(nodeName)
}

/**
 * @param {string} nodeName
 * @param {Object} requester
 */
GraphResults.prototype._recordInjection = function (nodeName, requester) {
  if (this._traces[nodeName] >= 0) {
    console.log('[Trace ' + this._builderName + '] ' +
                'Injecting "' + nodeName + '" -> "' + requester.newName + '"')
    this._traces[requester.newName] = this._traces[nodeName] - 1
  }
}

/**
 * @param {string} nodeName
 * @param {Object} requester
 * @return {Object} The resolved value or null if there's no cached result.
 */
GraphResults.prototype.getResult = function (nodeName, requester) {
  this._recordInjection(nodeName, requester)
  return this._values[nodeName]
}

/**
 * @param {Object} node
 * @param {Object} requester
 * @return {Object} The resolved value or null if there's no cached result.
 */
GraphResults.prototype.getHashedResult = function (node, requester) {
  if (this._hashedValues[node.nonImportantHash]) {
    this._recordInjection(node.newName, requester)
    return this._hashedValues[node.nonImportantHash]
  }
  return null
}

/** @return {Q.Promise} */
GraphResults.prototype.getPromise = function () {
  return this._outputDefer.promise
}

/** @param {string} nodeName */
GraphResults.prototype.resolveOutputNode = function (nodeName) {
  if (this._errors[nodeName]) this._outputDefer.reject(this._errors[nodeName])
  else this._outputDefer.resolve(this._values[nodeName])
}


/**
 * @param {*} value
 * @param {number=} depth The depth of the trace. 0 indicates that we only
 *     print the returned node. 1 indicates that we print its direct caller.
 *     and so on. Defaults to 2.
 * @constructor
 */
GraphResults.Tracer = function (value, depth) {
  this._tracedValue = value
  this._depth = typeof depth == 'number' ? depth : 2
}


module.exports = GraphResults
