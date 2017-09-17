'use strict';

/**
 * Module dependencies
 */
var path = require('path'),
  errorHandler = require(path.resolve('./modules/core/server/controllers/errors.server.controller')),
  mongoose = require('mongoose'),
  passport = require('passport'),
  async = require('async'),
  jwt = require('jsonwebtoken'),
  User = mongoose.model('User');

var utilsExtend = require(path.resolve('./modules/core/server/utils/utilsExtend.js'));

const delay = require('delay');
var mysql = require('mysql2');

// URLs for which user can't be redirected on signin
var noReturnUrls = [
  '/authentication/signin',
  '/authentication/signup'
];

// mysql config and connection pool
var config = {
  driver: mysql,		// Optional parameter. You can use a version of mysql or mysql2. Default mysql2 will be used when omitted.
  cluster: {
    canRetry: true,
    removeNodeErrorCount: 5,
    defaultSelector: 'RR'
  },
  global: {
    host: 'mysql-master',
    //port: '33060',
    user: 'my_user',
    password: 'my_password',
    database: 'my_database',
    connectionLimit: 100,
    waitForConnections: true,
    queueLimit: 10
  },
  pools: {
    master: {
      config: {
        user: 'my_user'
      },
      nodes: [{
        host: 'mysql-master',
        //port: '32769'
      }]
    },
    slave: {
      config: {
        user: 'my_user'
      },
      nodes: [{
        host: 'mysql-slave',
        //port: '32770'
      }
        //   ,{
        //   //host : '192.168.211.129',
        //   port:'32782',
        //   user : 'my_user'
        // }
      ]
    }
  }
}

var cluster = require("mysql-cluster")(config);

const tokenSecret = 'tokenSecret'; // this one should be save in env variable
/**
 * login after passport authentication
 */
exports.login = async function (req, res, next) {

  // sign token

  const email = req.body.email;//'alan@test.com';
  const password = req.body.password;//'password';


  var errReturn = function (message) {
    let preneticsError = utilsExtend.createPreneticsError(message);
    res.status(400).json(preneticsError);
  };

  let isValidateEmailPsw = localValidate(email, password);

  console.log('isValidateEmailPsw (local):', isValidateEmailPsw);
  if (!isValidateEmailPsw) {
    return errReturn('Email or password format is incorrect (Local Valid), please check');
  }

  try {

    // connection to one of nodes inside "slave".

    // simulate network delay;
    //await delay(1000);

    //NOTE: not support promise, can't use async
    cluster.slave(async function (err, conn) {
      if (!err) {
        //NOTE: to avoid sql injection.  using conn.escape()
        const sql = "select email, name_first,name_last, birth name_date from user WHERE email=" + conn.escape(email) +
          " AND password = SHA1(CONCAT(password_salt, " + conn.escape(password) +
          ")) limit 1";

        // console.debug('sql is :' + sql);
        conn.query(sql, function (err, result, fields) {
          conn.release(); // Put the connection back into pool.

          if (!!err) {
            return errReturn('query failed:' + JSON.stringify(err)); // simple solution
          } else {
            // do something
            // console.debug(result);

            if (!!result && !!result[0]) {
              // create token
              const loginEmail = result[0].email;
              const loginNameFirst = result[0].name_first;
              const data = {email: loginEmail, name_first: loginNameFirst};
              var token = jwt.sign({
                exp: Math.floor(Date.now() / 1000) + (60 * 60),  // 1 hour
                data: data
              }, tokenSecret);

              // console.log(token);
              res.status(200).send({state: 200, msg: 'login success', token: token, userData: result});
            } else {
              return errReturn('query email or password is not valid');
            }

          }
        });

        /*
         console.log('###########');
         console.log(conn);
         const [rows, fields] = await conn.execute(sql, ['Morty', 14]);
         console.log('rows are:' + rows);
         */

      } else {
        return errReturn('Failed - connect to mysql');
      }

    })
  }
  catch (err) {
    let preneticsError = utilsExtend.createPreneticsError(err);
    return res.status(400).json(preneticsError);
  }


};

/**
 * get login user's genetics result
 * to avoid query database, just use token validate login user
 * @param req
 * @param res
 * @param next
 * @returns {Promise.<void>}
 */
exports.getGenetic = async function (req, res, next) {
  // sign token
  // const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE1MDU0NzgyMTcsImRhdGEiOnsiZW1haWwiOiJhbGFuQHRlc3QuY29tIiwibmFtZV9maXJzdCI6IkFsYW4ifSwiaWF0IjoxNTA1NDc0NjE3fQ.oguKNa3YpEeJMP_IfuHOE2C8Z7cHHhTEIIqGrKk_SpU';

  // get token
  let token;
  let bearerHeader = req.headers["authorization"];
  if (typeof bearerHeader !== 'undefined') {
    let bearer = bearerHeader.split(" ");
    token = bearer[1];
  } else {
    return res.status(403).json({
      status: 'failure',
      userMessage: 'User is not authorized'
    });
  }

  let errReturn = function (message) {
    let preneticsError = utilsExtend.createPreneticsError(message);
    res.status(400).json(preneticsError);
  };

  // verify token
  let email = '';
  let name_first = '';
  try {
    const decoded = jwt.verify(token, tokenSecret);
    console.log('decoded:' + JSON.stringify(decoded));

    email = decoded.data.email;
    name_first = decoded.data.name_first;


  }
  catch (e) {
    return errReturn('token it not valid or expired, please login again');
  }

  try {

    // Aquire connection to one of nodes inside "slave".
    //NOTE: not support promise, can't use async
    cluster.slave( function (err, conn) {
      if (!err) {
        const sql = "select genetic from user WHERE email=" + conn.escape(email) +
          "";

        console.log('sql is :' + sql);
        conn.query(sql, function (err, result, fields) {
          conn.release(); // Put the connection back into pool.

          if (!!err) {
            return errReturn('query failed:' + JSON.stringify(err)); // simple solution
          } else {
            // do something
            console.debug(result);

            if (!!result) {
              // create token

              // refresh token
              const data = {email: email, name_first: name_first};
              var token = jwt.sign({
                exp: Math.floor(Date.now() / 1000) + (60 * 60),  // 1 hour
                data: data
              }, tokenSecret);

              // console.log(token);
              res.status(200).send({state: 200, msg: 'get genetic success', token: token, data: result[0]});
            } else {
              return errReturn('query email and pass error:' + err);
            }

          }
        });

        /*
         console.log('###########');
         console.log(conn);
         const [rows, fields] = await conn.execute(sql, ['Morty', 14]);
         console.log('rows are:' + rows);
         */

      } else {
        return errReturn('Failed - connect to mysql');
      }

    })
  }
  catch (err) {
    let preneticsError = utilsExtend.createPreneticsError(err);
    return res.status(400).json(preneticsError);
  }


};


/**
 * Check is email and password match basic requirement (locally)
 * @param email
 * @param password
 * @return boolean
 */
let localValidate = function (email, password) {
  let isValidated = false;

  // check email format
  var regEmail = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  let passEmail = regEmail.test(email);
  // console.log('in localValidate - email check:', email + '  -   ' + passEmail);

  let regPassword = /^([a-z0-9]){8}$/i;  // must be 8 alphanumeric policy code
  let passPassword = regPassword.test(password);
  // console.log('in localValidate - password check:', password + '  -   ' + passPassword);

  return passEmail && passPassword
};


/**
 * Signup
 */
exports.signup = function (req, res) {
  // For security measurement we remove the roles from the req.body object
  delete req.body.roles;

  // Init user and add missing fields
  var user = new User(req.body);
  user.provider = 'local';
  user.displayName = user.firstName + ' ' + user.lastName;

  // Then save the user
  user.save(function (err) {
    if (err) {
      return res.status(422).send({
        message: errorHandler.getErrorMessage(err)
      });
    } else {
      // Remove sensitive data before login
      user.password = undefined;
      user.salt = undefined;

      req.login(user, function (err) {
        if (err) {
          res.status(400).send(err);
        } else {
          res.json(user);
        }
      });
    }
  });
};

/**
 * Signin after passport authentication
 */
exports.signin = function (req, res, next) {
  passport.authenticate('local', function (err, user, info) {
    if (err || !user) {
      res.status(422).send(info);
    } else {
      // Remove sensitive data before login
      user.password = undefined;
      user.salt = undefined;

      req.login(user, function (err) {
        if (err) {
          res.status(400).send(err);
        } else {
          res.json(user);
        }
      });
    }
  })(req, res, next);
};

/**
 * Signout
 */
exports.signout = function (req, res) {
  req.logout();
  res.redirect('/');
};

/**
 * OAuth provider call
 */
exports.oauthCall = function (strategy, scope) {
  return function (req, res, next) {
    if (req.query && req.query.redirect_to)
      req.session.redirect_to = req.query.redirect_to;

    // Authenticate
    passport.authenticate(strategy, scope)(req, res, next);
  };
};

/**
 * OAuth callback
 */
exports.oauthCallback = function (strategy) {
  return function (req, res, next) {

    // info.redirect_to contains inteded redirect path
    passport.authenticate(strategy, function (err, user, info) {
      if (err) {
        return res.redirect('/authentication/signin?err=' + encodeURIComponent(errorHandler.getErrorMessage(err)));
      }
      if (!user) {
        return res.redirect('/authentication/signin');
      }
      req.login(user, function (err) {
        if (err) {
          return res.redirect('/authentication/signin');
        }

        return res.redirect(info.redirect_to || '/');
      });
    })(req, res, next);
  };
};

/**
 * Helper function to save or update a OAuth user profile
 */
exports.saveOAuthUserProfile = function (req, providerUserProfile, done) {
  // Setup info and user objects
  var info = {};
  var user;

  // Set redirection path on session.
  // Do not redirect to a signin or signup page
  if (noReturnUrls.indexOf(req.session.redirect_to) === -1) {
    info.redirect_to = req.session.redirect_to;
  }

  // Define a search query fields
  var searchMainProviderIdentifierField = 'providerData.' + providerUserProfile.providerIdentifierField;
  var searchAdditionalProviderIdentifierField = 'additionalProvidersData.' + providerUserProfile.provider + '.' + providerUserProfile.providerIdentifierField;

  // Define main provider search query
  var mainProviderSearchQuery = {};
  mainProviderSearchQuery.provider = providerUserProfile.provider;
  mainProviderSearchQuery[searchMainProviderIdentifierField] = providerUserProfile.providerData[providerUserProfile.providerIdentifierField];

  // Define additional provider search query
  var additionalProviderSearchQuery = {};
  additionalProviderSearchQuery[searchAdditionalProviderIdentifierField] = providerUserProfile.providerData[providerUserProfile.providerIdentifierField];

  // Define a search query to find existing user with current provider profile
  var searchQuery = {
    $or: [mainProviderSearchQuery, additionalProviderSearchQuery]
  };

  // Find existing user with this provider account
  User.findOne(searchQuery, function (err, existingUser) {
    if (err) {
      return done(err);
    }

    if (!req.user) {
      if (!existingUser) {
        var possibleUsername = providerUserProfile.username || ((providerUserProfile.email) ? providerUserProfile.email.split('@')[0] : '');

        User.findUniqueUsername(possibleUsername, null, function (availableUsername) {
          user = new User({
            firstName: providerUserProfile.firstName,
            lastName: providerUserProfile.lastName,
            username: availableUsername,
            displayName: providerUserProfile.displayName,
            profileImageURL: providerUserProfile.profileImageURL,
            provider: providerUserProfile.provider,
            providerData: providerUserProfile.providerData
          });

          // Email intentionally added later to allow defaults (sparse settings) to be applid.
          // Handles case where no email is supplied.
          // See comment: https://github.com/meanjs/mean/pull/1495#issuecomment-246090193
          user.email = providerUserProfile.email;

          // And save the user
          user.save(function (err) {
            return done(err, user, info);
          });
        });
      } else {
        return done(err, existingUser, info);
      }
    } else {
      // User is already logged in, join the provider data to the existing user
      user = req.user;

      // Check if an existing user was found for this provider account
      if (existingUser) {
        if (user.id !== existingUser.id) {
          return done(new Error('Account is already connected to another user'), user, info);
        }

        return done(new Error('User is already connected using this provider'), user, info);
      }

      // Add the provider data to the additional provider data field
      if (!user.additionalProvidersData) {
        user.additionalProvidersData = {};
      }

      user.additionalProvidersData[providerUserProfile.provider] = providerUserProfile.providerData;

      // Then tell mongoose that we've updated the additionalProvidersData field
      user.markModified('additionalProvidersData');

      // And save the user
      user.save(function (err) {
        return done(err, user, info);
      });
    }
  });
};

/**
 * Remove OAuth provider
 */
exports.removeOAuthProvider = function (req, res, next) {
  var user = req.user;
  var provider = req.query.provider;

  if (!user) {
    return res.status(401).json({
      message: 'User is not authenticated'
    });
  } else if (!provider) {
    return res.status(400).send();
  }

  // Delete the additional provider
  if (user.additionalProvidersData[provider]) {
    delete user.additionalProvidersData[provider];

    // Then tell mongoose that we've updated the additionalProvidersData field
    user.markModified('additionalProvidersData');
  }

  user.save(function (err) {
    if (err) {
      return res.status(422).send({
        message: errorHandler.getErrorMessage(err)
      });
    } else {
      req.login(user, function (err) {
        if (err) {
          return res.status(400).send(err);
        } else {
          return res.json(user);
        }
      });
    }
  });
};
