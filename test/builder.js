// Copyright 2012 The Obvious Corporation.
var Q = require('kew')
var nodeunitq = require('nodeunitq')
var builder = new nodeunitq.Builder(exports)
var shepherd = require ('../lib/shepherd')
var graph

// set up a graph for testing
exports.setUp = function (done) {
  graph = this.graph = new shepherd.Graph
  done()
}

// test that builder names are required
builder.add(function testRequiredBuilderNames(test) {
  this.graph.enforceBuilderNames(shepherd.ErrorMode.ERROR)

  try {
    this.graph.newBuilder()
    test.fail("Should have thrown an error due to a missing name")
  } catch (e) {
    test.equal(e.message, "A builder name is required", "Should have thrown an error due to a missing name")
  }
  test.done()
})

// should throw an error if a node is missing
builder.add(function testMissingBuilderNode(test) {
  return this.graph.newBuilder()
    .builds('user')
    .run({}, function (err, result) {
      test.ok(/Node 'user' was not found/.test(err.message), 'Error should be defined: ' + err)
    })
    .then(function () {
      test.equal(true, false, '.then() should not be called for promise')
    })
    .fail(function (err) {
      test.ok(/Node 'user' was not found/.test(err.message), 'Error should be defined: ' + err)
    })
})

// should be able to retrieve member variables of graph nodes
builder.add(function testMemberVariable(test) {
  var nodeValue = {name: 'Jeremy'}
  this.graph.add('user', this.graph.literal(nodeValue))

  return this.graph.newBuilder()
    .builds('user.name')
    .run({})
    .then(function (result) {
      test.equal(result['user.name'], nodeValue.name, 'Response should be returned through promise')
    })
})

// test that nodes with identical functions and dependencies only run once
builder.add(function testDeduplication(test) {
  var numCalls = 0
  var user = {name: 'Jeremy'}
  var getUser = function () {
    numCalls++
    return user
  }
  this.graph.add('user1', getUser)
  this.graph.add('user2', getUser)
  this.graph.add('user3', getUser)

  return this.graph.newBuilder()
    .builds('user1')
    .builds('user2')
    .builds('user3')
    .run({})
    .then(function (result) {
      test.equal(result['user1'], user, 'Response.user1 should be returned through promise')
      test.equal(result['user2'], user, 'Response.user2 should be returned through promise')
      test.equal(result['user3'], user, 'Response.user3 should be returned through promise')
      test.equal(numCalls, 1, 'getUser should only be called once')
    })
})

// test that nodes with identical functions and different dependencies run multiple times
builder.add(function testDeduplication2(test) {
  var numCalls = 0
  var user = {name: 'Jeremy'}
  var getUser = function () {
    numCalls++
    return user
  }
  this.graph.add('user1', getUser, ['a'])
  this.graph.add('user2', getUser, ['b'])
  this.graph.add('user3', getUser, ['c'])

  this.graph.add('a', 1)
  this.graph.add('b', 2)
  this.graph.add('c', 3)

  return this.graph.newBuilder()
    .builds('user1')
    .builds('user2')
    .builds('user3')
    .run({})
    .then(function (result) {
      test.equal(result['user1'], user, 'Response.user1 should be returned through promise')
      test.equal(result['user2'], user, 'Response.user2 should be returned through promise')
      test.equal(result['user3'], user, 'Response.user3 should be returned through promise')
      test.equal(numCalls, 3, 'getUser should only be called once')
    })
})

// test creating a builder which remaps a node to a new name
builder.add(function testRemappingBuilderNode(test) {
  var nodeValue = {name: 'Jeremy'}
  this.graph.add('userObj', this.graph.literal(nodeValue))

  return this.graph.newBuilder()
    .builds({'user': 'userObj'})
    .run({})
    .then(function (result) {
      test.equal(result['user'], nodeValue, 'Response should be returned through promise')
    })
})

// test creating a graph node which remaps a dependency to a new name
builder.add(function testRemappingNodeDependency(test) {
  var nodeValue = {name: 'Jeremy'}
  this.graph.add('userObj', this.graph.literal(nodeValue))

  function getUsernameFromUser(user) {
    return user.name
  }
  this.graph.add('username-fromUser', getUsernameFromUser, ['user'])

  this.graph.add('username-test', this.graph.subgraph)
    .builds({'!user': 'userObj'})
    .builds('username-fromUser').using('user')

  return this.graph.newBuilder()
    .builds('username-test')
    .run({})
    .then(function (result) {
      test.equal(result['username-test'], nodeValue.name, 'Response should be returned through promise')
    })
})

// test creating void nodes from the builder
builder.add(function testBuilderVoidNode(test) {
  var output = ""
  var username = "Jeremy"

  this.graph.add("str-toUpper", function (str) {
    output += "upper"
    return str.toUpperCase()
  }, ['str'])

  this.graph.add("str-toLower", function (str) {
    output += "lower"
    return str.toLowerCase()
  }, ['str'])

  this.graph.add("str-test", this.graph.subgraph)
    .args('str')

  return this.graph.newBuilder()
    .builds('?str-toUpper').using({str: 'username'})
    .builds('?str-toLower').using({str: 'username'})
    .builds('str-test').using('str-toLower')
    .run({username: username})
    .then(function (result) {
      test.equal(result['str-test'], username.toLowerCase(), 'Response should be returned through promise')
      test.equal(output, 'upperlower', 'Only lower should have been ran')
    })
})

builder.add(function testBuilderVoidNodeMapped(test) {
  var username = "Jeremy"

  this.graph.add("upper", function (str) {
    return str.toUpperCase()
  }, ['str'])

  this.graph.add("str-test", this.graph.subgraph, ['str'])

  return this.graph.newBuilder()
  .configure({'str-toUpper': 'upper'}).using({str: 'username'})
    .builds('str-test').using('str-toUpper')
    .run({username: username})
    .then(function (result) {
      test.equal(result['str-test'], username.toUpperCase())
    })
})

builder.add(function testInvalidConfigures(test) {
  var username = "Jeremy"

  this.graph.add("upper", function (str) {
    return str.toUpperCase()
  }, ['str'])

  try {
    this.graph.newBuilder()
    .configure({'?str-toUpper': 'upper'}).using({str: 'username'})
  } catch (e) {
    if (!/invalid node name/.test(e.message)) {
      throw e
    }
  }
  test.done()
})

// test that builds can be mapped directly to literals
builder.add(function testBuildLiteral(test) {
  return this.graph.newBuilder()
    .builds({filterBy: this.graph.literal('hello')})
    .run()
    .then(function (data) {
      test.equal(data.filterBy, 'hello', "Value should match the literal")
    })
})

builder.add(function testVoidNodeFeatures(test) {
  var output = ''

  graph.add('num', function (n) {
    output += n
    return n
  }, ['n'])

  graph.add('driver', function (x) {
     test.equal(3, x)
     return x
    })
    .builds({'!one': 'num'}).using({n: 1})
    .builds({'?two': 'num'}).using({n: 2})
    .builds({'three': 'num'}).using({n: 3})
    .builds({'?four': 'num'}).using({n: 4})

  return this.graph.newBuilder()
    .builds('driver')
    .builds({'?five': 'num'}).using({n: 5})
    .run()
    .then(function (data) {
      test.equal(undefined, data['five'])
      test.equal(undefined, data['?five'])
      test.equal(3, data['driver'])

      // The order isn't really defined, but all characters
      // should be in the output string.
      test.equal(5, output.length, output)
      test.notEqual(-1, output.indexOf(1), output)
      test.notEqual(-1, output.indexOf(2), output)
      test.notEqual(-1, output.indexOf(3), output)
      test.notEqual(-1, output.indexOf(4), output)
      test.notEqual(-1, output.indexOf(5), output)
    })
})

builder.add(function testCreateInjector(test) {
  graph.add('num', function (n) {
    return n
  }, ['n'])

  var builder = graph.newBuilder()
    .builds({'one': 'num'}).using({n: 1})
    .builds({'two-fromNum': 'num'}).using({n: 2})
    .builds({'three': 'num'}).using({n: 3})

  var handler = builder.createInjector(function (three, one, two) {
    test.equal(3, three)
    test.equal(2, two)
    test.equal(1, one)
  })

  return builder.run().then(handler)
})

builder.add(function testCreateInjectorBadParams(test) {
  graph.add('num', function (n) {
    return n
  }, ['n'])

  var builder = graph.newBuilder()
    .builds({'one': 'num'}).using({n: 1})

  try {
    builder.createInjector(function (two) {})
    test.fail('Expected error')
  } catch (e) {
    if (e.message != 'No injector found for parameter: two') throw e
  }

  test.done()
})

builder.add(function testCreateInjectorWithPlaceholders(test) {
  graph.add('num', function (n) {
    return n
  }, ['n'])

  var builder = graph.newBuilder()
    .builds({'one': 'num'}).using({n: 1})
    .builds({'two-fromNum': 'num'}).using({n: 2})
    .builds({'three': 'num'}).using({n: 3})

  var handler = builder.mapOutputKeysToArgs(function (three, one, two, four, five) {}, ['four', 'five'])

  test.done()
})

builder.add(function testInject(test) {
  var nums = []
  graph.add('num', function (n) {
    nums.push(n)
    return n
  }, ['n'])

  graph.add('arrayOfNums')
    .builds({'!five': 'num'}).using({n: 5})
    .builds({'one': 'num'}).using({n: 1})
    .builds({'two-fromNum': 'num'}).using({n: 2})
    .builds({'four': 'num'}).using({n: 4})
    .builds({'three': 'num'}).using({n: 3})
    .inject(function (three, one, two) {
      test.equal(3, three)
      test.equal(2, two)
      test.equal(1, one)
      test.equal(4, arguments[3])
      test.ok(nums.indexOf(4) != -1, '4 should have been created')
      test.ok(nums.indexOf(5) != -1, '5 should have been created')
      return [one, two, three]
    })

  return graph.newBuilder().builds('arrayOfNums').run().then(function (data) {
    test.deepEqual([1, 2, 3], data['arrayOfNums'])
  })
})

builder.add(function testInjectBadParams(test) {
  graph.add('num', function (n) {
    return n
  }, ['n'])

  try {
    graph.add('arrayOfNums')
        .builds('one')
        .inject(function (two) {})
    test.fail('Expected error')
  } catch (e) {
    if (e.message != 'No injector found for parameter: two') throw e
  }

  test.done()
})

builder.add(function testInjectArgs(test) {
  var nums = []
  graph.add('num', function (n) {
    nums.push(n)
    return n
  }, ['n'])

  graph.add('arrayOfNums').args('?five', 'two', 'one')
    .builds({'four': 'num'}).using({n: 4})
    .builds({'three': 'num'}).using({n: 3})
    .inject(function (three, one, two) {
      test.equal(3, three)
      test.equal(2, two)
      test.equal(1, one)
      test.equal(4, arguments[3])
      test.ok(nums.indexOf(4) != -1, '4 should have been created')
      test.ok(nums.indexOf(5) != -1, '5 should have been created')
      return [one, two, three]
    })

  return graph.newBuilder()
      .builds({'?five': 'num'}).using({n: 5})
      .builds({'?one': 'num'}).using({n: 1})
      .builds({'?two': 'num'}).using({n: 2})
      .builds('arrayOfNums').using('five', 'one', 'two')
      .run().then(function (data) {
    test.deepEqual([1, 2, 3], data['arrayOfNums'])
  })
})


builder.add(function testInjectProps(test) {
  graph.add('config', function () {
    return {
      base: 'base',
      secret: 'secret',
      private_: 'private'
    }
  })

  graph.add('array')
    .builds('config.secret')
    .builds('config.private_')
    .builds('config.base')
    .inject(function (base, private_, secret) {
      return [base, private_, secret]
    })

  return graph.newBuilder()
      .builds('array')
      .run().then(function (data) {
    test.deepEqual(['base', 'private', 'secret'], data['array'])
  })
})

builder.add(function testUncompiledNodes(test) {
  graph.add('one').fn(function () { return 1 })

  // Make sure this node is never compiled.
  graph.add('two').builds('non-existent-node-impossible-to-compile')

  return graph.newBuilder()
      .builds('one')
      .run().then(function (data) {
    test.equal(1, data['one'])

    return graph.newBuilder().builds('two').run()
  }).then(function (e) {
    test.fail('Expected error')
  }).fail(function (e) {
    if (e.message.indexOf('non-existent-node-impossible-to-compile') === -1) {
      throw e
    }
    return false
  })
})



builder.add(function testBuilderInputUnmodified(test) {
  this.graph.add('upper', function (str) {
    return str.toUpperCase()
  }, ['str'])

  var inputs = {str: 'nick'}
  return this.graph.newBuilder()
    .builds('upper')
    .run(inputs)
    .then(function (result) {
      test.deepEqual(['str'], Object.keys(inputs))
      test.deepEqual(['upper'], Object.keys(result).sort())
    })
})

builder.add(function testContructor(test) {
  function MyType(a, b) {
    this.a = a
    this.b = b
  }

  graph.add('myType')
    .args('a', 'b')
    .ctor(MyType)

  return graph.newBuilder()
      .builds('myType').using({'a': graph.literal(1)}, {'b': graph.literal(2)})
      .run().then(function (data) {
    var myType = data['myType']
    test.ok(myType instanceof MyType)
    test.equal(1, myType.a)
    test.equal(2, myType.b)
  })
})


builder.add(function testContructorInjects(test) {
  function MyType(a, b) {
    this.a = a
    this.b = b
  }

  graph.add('myType')
    .args('b', 'c', 'a')
    .ctor(MyType)

  return graph.newBuilder()
      .builds('myType')
        .using({'a': graph.literal(1)}, {'b': graph.literal(2)}, {'c': graph.literal(3)})
      .run()
  .then(function (data) {
    var myType = data['myType']
    test.ok(myType instanceof MyType)
    test.equal(1, myType.a)
    test.equal(2, myType.b)
  })
})
