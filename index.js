var express = require('express');
var app = express();
var helmet = require('helmet');
var compression = require('compression');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var jwt = require('jsonwebtoken');
var expressJwt = require('express-jwt');
var fs = require('fs');
var path = require('path');
var async = require('async');
var pgp = require('pg-promise')();
var multer = require('multer');
var multerS3 = require('multer-s3');
var config = null;
var sha256 = require('js-sha256');
var winston = require('winston');
var logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.json(),
    winston.format.timestamp(),
    winston.format.prettyPrint()
  ),
  defaultMeta: { service: 'user-service' },
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log`
    // - Write all logs error (and below) to `error.log`.
    //
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
var AWS = require('aws-sdk');
if(process.env.NODE_ENV === 'prod') {
  AWS.config.loadFromPath('./aws_cred.json');
  config = require('./db_config.json');
} else {
  AWS.config.loadFromPath('./../aws_cred.json');
  config = require('./../db_config.json');
}
// var s3Cred = require('./../aws_cred.json');
var cn = {};

// database functions
var create_user = require('./func/db/create_user.js');
var login_user = require('./func/db/login_user.js');
var get_user = require('./func/db/get_user.js');
var get_user_by_id = require('./func/db/get_user_by_id.js');
var add_file = require('./func/db/add_file.js');
var add_job = require('./func/db/add_job.js');
var get_opportunities_by_user_id = require('./func/db/get_opportunities_by_user_id.js');
var get_jobs_by_user_id_and_job_type_id = require('./func/db/get_jobs_by_user_id_and_job_type_id.js');
var get_jobs_by_user_id = require('./func/db/get_jobs_by_user_id.js');
var update_job_type = require('./func/db/update_job_type.js');
var delete_file = require('./func/db/delete_file.js');
var update_job = require('./func/db/update_job.js');
var delete_job = require('./func/db/delete_job.js');
var delete_jobs = require('./func/db/delete_jobs.js');
var add_profile_image = require('./func/db/add_profile_image.js');
var update_user_sharing = require('./func/db/update_user_sharing.js');
var update_user_profile = require('./func/db/update_user_profile.js');
var user_exists = require('./func/db/user_exists.js');
var get_jobs_to_share_by_user_id = require('./func/db/get_jobs_to_share_by_user_id.js');
var get_users = require('./func/db/get_users.js');
var add_contact = require('./func/db/add_contact.js');
var delete_user = require('./func/db/delete_user.js');

// helper functions
var is_valid_variable = require('./func/op/is_valid_variable.js');
var id_matches = require('./func/op/id_matches.js');
var create_log = require('./func/op/create_log.js');

// globals
var jwtExp = 86400;
var port = 3000;

const homedir = require('os').homedir();
const S3 = new AWS.S3();
const S3_FILE_BUCKET = (process.env.NODE_ENV === 'prod' ? 'jobtrak-prod' : 'jobtrak');

// handle files attached to jobs
var upload = multer({
  storage: multerS3({
    s3: S3,
    bucket: S3_FILE_BUCKET,
    metadata: function(req, file, cb) {
      // logger.info("metadata", file);
      cb(null, { fieldName: file.originalname });
    },
    key: function(req, file, cb) {
      logger.info(file);
      logger.info('sha256 s3 path: ', sha256('files/' + req.user.sub + "/" + Date.now().toString() + "/" + file.originalname));
      cb(null, sha256('files/' + req.user.sub + "/" + Date.now().toString() + "/" + file.originalname));
    }
  })
});

// handle profile image uploads
var profile_image_upload = multer({
  storage: multerS3({
    s3: S3,
    bucket: S3_FILE_BUCKET,
    metadata: function(req, file, cb) {
      // logger.info("metadata", file);
      cb(null, { fieldName: file.originalname });
    },
    key: function(req, file, cb) {
      logger.info(file);
      logger.info('sha256 s3 path: ', sha256('profile_images/' + req.user.sub + "/" + Date.now().toString() + "/" + file.originalname));
      cb(null, sha256('profile_images/' + req.user.sub + "/" + Date.now().toString() + "/" + file.originalname));
    }
  })
});

// other uses
app.use(helmet());
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 1000000 }));
app.use(bodyParser.json({ limit: '50mb', extended: true }));
app.use(cookieParser());
app.use(compression());

// setup database configuration
if(process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));

  logger.log(create_log('info', 'DEV DB CONFIG'));
  cn = {
    host: config.dev.host,
    port: config.dev.port,
    database: config.dev.database,
    user: config.dev.user,
    password: config.dev.password
  };
} else {
  logger.log(create_log('info', 'PROD DB CONFIG'));
  cn = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password
  };
}

// initialize connection to database
var db = pgp(cn);

// hold the routes
var router = express.Router();

// handle asynchronous calls
const asyncHandler = fn => (req, res, next) =>
  Promise
    .resolve(fn(req, res, next))
    .catch(next);

// key paths for signing
var privateKeyPath = ((process.env.NODE_ENV === 'prod') ? './j-jwtRS256.key' : './../j-jwtRS256.key');
var publicKeyPath = ((process.env.NODE_ENV === 'prod') ? './j2-jwtRS256.key.pub' : './../j2-jwtRS256.key.pub');

// key constants
const RSA_PRIVATE_KEY = fs.readFileSync(privateKeyPath);
const RSA_PUBLIC_KEY = fs.readFileSync(publicKeyPath);

// middleware to check if the JWT in the cookie is correct for the user
const checkIfAuthenticated = expressJwt({
  secret: RSA_PUBLIC_KEY,
  algorithms: ['RS256'],
  getToken: function fromHeaderOrQueryString(req) {
    if (req.cookies && req.cookies.SESSIONID) {
      return req.cookies.SESSIONID;
    }
    return null;
  }
});

/*
  base route, just prints hello world currently
  change to an api information page to display different api calls
*/
router.get('/', asyncHandler ( (req, res, next) => res.send('Hello World!')) );

/*
  login route to check user and return cookie if authenticated/exists
  body:
    required:
      - email
      - password
*/
router.post('/login', asyncHandler ( (req, res) => {
  var email = req.body.email;
  var password = req.body.password;

  login_user(email, password, db)
    .then(function(data) {
      // if the user could not be validated
      if(data.validate_user === null) {
        logger.info('/login: could not validate login');
        res.status(401).json({ message: 'Unauthorized' });
      // if the login_user returned user data
      } else if(data.validate_user !== null) {
        // logger.info(data.validate_user.user_id);
        var user_id = data.validate_user.user_id;

        var jwtBearerToken = jwt.sign({}, RSA_PRIVATE_KEY, {
          algorithm: 'RS256',
          expiresIn: jwtExp,
          subject: user_id.toString()
        });

        // res.status(200).json({ data: jwtBearerToken });
        // cookie based storage
        res.cookie("SESSIONID", jwtBearerToken, {
            httpOnly:(process.env.NODE_ENV === 'prod' ? true : false),
            secure:(process.env.NODE_ENV === 'prod' ? true : false)
          })
          .status(200)
          .json({ message: 'OK', id: user_id });

      // if there was another reason the user could not login
      } else {
          logger.log(create_log('error', ('/login: failed to validate login for another reason')));
        res.status(500).json({ message: 'Internal server error.' });
      }
    // on login_user reject
    // cause: query_error, user_does_not_exist
    }, function(err) {
      logger.log(create_log('error', ('/login: error: ' + err.message)));
      if(err.message === 'user_does_not_exist') {
        res.status(404).json({ message: 'User does not exist.' });
      } else {
        res.status(500).json({ message: 'Internal server error.' });
      }
    });
}));

/*
  signup route to create a user and return cookie to authenticate
  the user
*/
router.post('/signup', asyncHandler( (req, res) => {
  // variables from body
  var email = req.body.email;
  var password = req.body.password;
  var firstname = req.body.firstname;
  var lastname = req.body.lastname;

  // TODO: change this to call is_valid_variable function
  // check if any of the values are null or missing
  if(email == null || password == null || firstname == null || lastname == null) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
  // if all of the values needed are there
  // attempt to create user
  } else {
    // call helper function, send db connection
    create_user(email, password, firstname, lastname, db)
      // receive promise
      // on success return 201 created
      .then(function() {
        // call helper function to get user info
        get_user(email, db)
          // retrieve user data from promise
          .then(function(data) {
            logger.info("/signup DATA:", data);
            var jwtBearerToken = jwt.sign({}, RSA_PRIVATE_KEY, {
              algorithm: 'RS256',
              expiresIn: jwtExp,
              subject: data.get_user.user_id.toString()
            });

            var dataDisplay = {
              user_id: data.get_user.user_id,
              firstname: data.get_user.firstname,
              lastname: data.get_user.lastname
            };

            // logger.info('environemnt: ', process.env.NODE_ENV);
            // logger.info(process.env.NODE_ENV === 'prod' ? true : false);
            // set cookie for the response, return 201, and a message
            res.cookie("SESSIONID", jwtBearerToken, {
                httpOnly:(process.env.NODE_ENV === 'prod' ? true : false),
                secure:(process.env.NODE_ENV === 'prod' ? true : false)
              })
              .status(201)
              .json({ message: 'User created.', data: dataDisplay });
          // if helper function returns an error
          }, function(err) {
              logger.log(create_log('error', ("/signup " + err)));
            res.status(500).json({ message: 'Internal server error.' });
          });
      // on error then determine error
      }, function(err) {
        // if the user already exists return 409 conflict code
        if(err.message === 'user_exists') {
          logger.info('/signup', err);
          res.status(409).json({ message: 'User already exists.' });
        // other errors
        } else {
          logger.log(create_log('error', ('/signup ' + err)));
          res.status(500).json({ message: 'Internal server error.'});
        }
      });
  }
}));

/*
  user route to get user information and display on the client
*/
router.get('/user/id/:id', checkIfAuthenticated, asyncHandler( (req, res, next) => {
  // variables from params
  var id = parseInt(req.params.id);

  // check if any of the values are null or missing
  if(!is_valid_variable(id)) {
    logger.info('/user/id/:id', 'invalid variable');
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
    return;
  // check if parameter id matches the token id
  // } else if(!id_matches(id, req.cookies.SESSIONID)) {
  //   res.status(401).json({ message: 'Unauthorized.' });
  //   return;
  // attempt to return user information
  } else {
    // call get_user db helper function
    get_user_by_id(id, db)
      .then(function(data) {
        logger.info("/user/id/:id DATA:", data);
        // return status and message
        res.status(200).json({ message: 'Success.', data: data.get_user_by_id });

      }, function(err) {
        // return status and message
        res.status(500).json({ message: 'Internal server error.' });
      })
      .catch(function(error) {
        logger.log(create_log('error', ("get_user_by_id PROMISE ERROR: " + error)));
        // return status and message
        res.status(500).json({ message: 'Internal server error.' });
      });
  }
}));

/*
  route to get all users
  required:
    amount: integer (max 10)
*/
router.post('/users', checkIfAuthenticated, asyncHandler((req, res, next) => {
  var max = 10;

  // variables from body
  var amount = parseInt(req.body.amount);

  // check if any of the values are null or missing
  if(!is_valid_variable(amount) || !(amount <= max)) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
    return;
  // check if parameter id matches the token id
  // } else if(!id_matches(id, req.cookies.SESSIONID)) {
  //   res.status(401).json({ message: 'Unauthorized.' });
  //   return;
  // attempt to return user information
  } else {
    // call get_user db helper function
    get_users(amount, db)
      .then(function(data) {
        logger.info("DATA:", data);
        // return status and message
        res.status(200).json({ message: 'Success.', data: data.get_users });
      }, function(err) {
        // return status and message
        res.status(500).json({ message: 'Internal server error.' });
      })
      .catch(function(error) {
        logger.log(create_log('error', ("get_users PROMISE ERROR: " + error)));
        // return status and message
        res.status(500).json({ message: 'Internal server error.' });
      });
  }
}));

/*
  upload route to save files from client and store their relevant information
  in the database
*/
router.post('/upload', checkIfAuthenticated, upload.array('files', 10), asyncHandler( (req, res, next) => {
  logger.info("FILES:", req.files);

  var filesArray = req.files;
  var type = req.body.type;

  if(!is_valid_variable(type)) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
    return;
  } else {
    // iterate files and perform operations on them
    // possibly move them to another location and delete them locally
    async.each(filesArray,
      function(file, next) {
        logger.info("FILE: ", file);
        // call helper function, send db connection
        add_file(
          file.originalname,
          file.encoding,
          file.mimetype,
          file.key,
          file.location,
          file.size,
          type,
          db
        )
          // receive promise
          // on success return 200
          .then(function() {
            next(file.key);
          // on error then determine error
          }, function(err) {
            logger.info(err);
            res.status(500).json({ message: 'Internal server error.' });
          });
      },
      // check if there was an error during the upload process
      function(filename, err) {
        logger.info("FILENAME:", filename);
        if(err) {
          logger.log(create_log('error', ("Error occurred in each " + err)));
          res.status(500).json({ message: 'Internal server error.' });
        } else {
          logger.info("finished processing");
          res.status(200).json({ message: 'Files uploaded successfully.', file: filename });
        }
      }
    );
  }
}));

/*
  upload profile image route to save profile images from client and store their
  relevant information in the database
  required:
    body:
      file: file to upload as the profile image
      user_id: user to attach image to
*/
router.post('/upload-profile-image', checkIfAuthenticated, profile_image_upload.single('profile_image', 1), asyncHandler( (req, res, next) => {
  logger.info("FILE:", req.file);

  var file = req.file;
  var user_id = req.body.user_id;

  if(!is_valid_variable(file) || !is_valid_variable(user_id)) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
    return;
  } else {
    // call helper function, send db connection
    add_profile_image(
      file.originalname,
      file.encoding,
      file.mimetype,
      file.key,
      file.location,
      file.size,
      1,
      user_id,
      db
    )
      // receive promise
      // on success return 200
      .then(function() {
        res.status(200).json({ message: 'Success.', file: file.key });
      // on error then determine error
      }, function(err) {
        logger.log(create_log('error', ('/upload-profile-image ' + err)));
        res.status(500).json({ message: 'Internal server error.' });
      });
  }
}));

/*
  endpoint to add a job
*/
router.post('/job', checkIfAuthenticated, asyncHandler( (req, res, next) => {
  logger.info('/job body: ', req.body);

  var body = req.body;

  // job specific info
  var job_title = body.jobTitle;
  var company_name = body.companyName;
  var link = body.link;
  var notes = body.notes;
  var type = body.type;
  var attachments = body.files;
  var user_id = body.userId;

  // persons of contact array
  var pocs = body.pocs;

  if(!is_valid_variable(job_title) || !is_valid_variable(company_name) || !is_valid_variable(link) ||
    !is_valid_variable(type) || !is_valid_variable(user_id) || (attachments === "" || attachments === undefined)) {
    res.status(400).json({ message: 'Bad request.' });
    return;
  // check if parameter id matches the token id
  } else if(!id_matches(user_id, req.cookies.SESSIONID)) {
    res.status(401).json({ message: 'Unauthorized.' });
    return;
  } else {
    logger.info('/job type: ', type);
    add_job(job_title, company_name, link, notes, type, attachments, user_id, db)
      .then(function(data) {
        logger.info("/job add_job DATA:", data);

        var jobs_id = data.insert_job.jobs_id;
        var insert_job_data = data.insert_job;

        var len = pocs.length;
        if(len > 0) {
          for(var i = 0; i < len; i++) {
            pocs[i].jobs_id = jobs_id;
            pocs[i].user_id = user_id;
          }

          logger.info('pocs to add', JSON.stringify(pocs));
          add_contact(pocs, db)
            .then(add_contact_data => {
              logger.info("/job add_contact DATA:", add_contact_data);
              // return status and message
              res.status(200).json({ message: 'Success.', data:  add_contact_data.insert_contact });
            }, add_contact_err => {
              logger.info("/job add_contact ERROR:", add_contact_err);
              // return status and message
              res.status(500).json({ message: 'Internal server error.' });
            });
        } else {
          // return status and message
          res.status(200).json({ message: 'Success.', data:  insert_job_data });
        }
      }, function(err) {
        logger.log(create_log('error', ("/job add_job ERROR: " + err)));
        // return status and message
        res.status(500).json({ message: 'Internal server error.' });
      });
  }
}));

/*
  get jobs for user by id
*/
router.get('/job/id/:id', checkIfAuthenticated, asyncHandler( (req, res, next) => {
  // variables from body
  var id = parseInt(req.params.id);

  // check if any of the values are null or missing
  if(!is_valid_variable(id)) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
    return;
  // check if parameter id matches the token id
  } else if(!id_matches(id, req.cookies.SESSIONID)) {
    // check if user allows other people to look at jobs
    // res.status(401).json({ message: 'Unauthorized.' });
    get_jobs_to_share_by_user_id(id, db)
      .then(data => {
        logger.info("/job/id/:id DATA:", data);

        // return status and message
        res.status(200).json({ message: 'Success.', data: data.get_jobs_to_share_by_user_id });
        return;
      },
      err => {
        logger.log(create_log('error', ("/job/id/:id ERROR: " + err)));

        // return status and message
        res.status(500).json({ message: 'Internal server error.' });
        return;
      });
  // attempt to return opportunites tied to the user
  } else {
    // call db function to get all jobs by user id
    get_jobs_by_user_id(id, db)
      // on success
      .then(data => {
        logger.info("/job/id/:id DATA:", data);

        // return status and message
        res.status(200).json({ message: 'Success.', data: data.get_jobs_by_user_id });
        return;
      // on failure
      },
      err => {
        logger.log(create_log('error', ("/job/id/:id ERROR: " + err)));

        // return status and message
        res.status(500).json({ message: 'Internal server error.' });
        return;
      });
  }
}));

/*
  update job for user under jobs_id where job_type is
*/
router.post('/:id/job/:jobs_id/update/:job_type_id', checkIfAuthenticated, asyncHandler( (req, res, next) => {
  logger.info("PARAMS:", req.params);
  // variables from url
  var user_id = parseInt(req.params.id);
  var jobs_id = parseInt(req.params.jobs_id);
  var job_type_id = parseInt(req.params.job_type_id);

  // check if any of the values are null or missing
  if(!is_valid_variable(user_id)) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
    return;
  // check if parameter id matches the token id
  } else if(!id_matches(user_id, req.cookies.SESSIONID)) {
    res.status(401).json({ message: 'Unauthorized.' });
    return;
  // attempt to update a job
  } else {
    // call db function
    update_job_type(user_id, jobs_id, job_type_id, db)
      .then(function(data) {
        logger.info("/job/:id/update/:job_id/:job_type_id DATA:", data);
        res.status(200).json({ message: 'Success.' });
      }, function(err) {
        logger.log(create_log('error', ("/job/:id/update/:job_id/:job_type_id ERROR: " + err)));
        res.status(500).json({ message: 'Internal server error.' });
      });
  }
}));

/*
  delete a job
  body:
    required:
      - jobs_id
      - file_name
*/
router.post("/:id/delete/job", checkIfAuthenticated, asyncHandler( (req, res, next) => {
  var user_id = parseInt(req.params.id);
  var jobs_id = parseInt(req.body.jobs_id);

  // check if any of the values are null or missing
  if(!is_valid_variable(jobs_id)) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
    return;
  // check if parameter id matches the token id
  } else if(!id_matches(user_id, req.cookies.SESSIONID)) {
    res.status(401).json({ message: 'Unauthorized.' });
    return;
  // attempt to delete a job
  } else {
    // call db function
    delete_job(
      jobs_id,
      db
    ).then(function(data) {
      logger.info('/:id/delete/job DATA:', data);

      var fileNamesArr = data.delete_job;
      var objects = [];
      if(fileNamesArr !== null && fileNamesArr.length !== 0) {
        fileNamesArr.forEach(fileName => {
          objects.push({ Key: fileName });
        });
        var params = {
            Bucket: S3_FILE_BUCKET,
            Delete: {
              Objects: objects
            }
        };
        // delete file from s3
        S3.deleteObjects(params, function(err, data) {
          // if there was an error deleting the s3 object then return 500
          if(err) {
            logger.log(create_log('error', ('/:id/delete/job S3 ERR: ' + err)));
            res.status(500).json({ message: 'Internal server error.' });
            return;
          }

          // log success and return success
          logger.info('/:id/delete/job S3 DATA: ', data);
        });
        logger.info('/:id/delete/job: JOB DELETED SUCCESSFULLY');
        res.status(200).json({ message: 'Success' });
      } else {
        res.status(200).json({ message: 'Success' });
      }
    }, function(err) {
      logger.log(create_log('error', ('/:id/delete/job ERROR: ' + err)));
      // return status and message
      res.status(500).json({ message: 'Internal server error.' });
    });
  }
}));

/*
  delete multiple jobs
  body:
    required:
      - jobs_id - array
*/
router.post("/:id/delete/jobs", checkIfAuthenticated, asyncHandler( (req, res, next) => {
  var user_id = parseInt(req.params.id);
  var jobs_id = req.body.jobs_ids;

  // check if any of the values are null or missing
  if(!is_valid_variable(jobs_id)) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
    return;
  } else if(jobs_id.length === 0) {
    // if there are no ids to delete then there is nothing to do
    res.status(400).json({ message: 'Bad request.' });
    return;
  // check if parameter id matches the token id
  } else if(!id_matches(user_id, req.cookies.SESSIONID)) {
    res.status(401).json({ message: 'Unauthorized.' });
    return;
  // attempt to delete a job
  } else {
    // create clause to add to query
    var clause = '';
    var arrLength = jobs_id.length;
    for(var i = 0; i < arrLength; i++) {
      clause = clause + jobs_id[i] + ',';
    }
    clause = clause.slice(0, -1);

    // call db function
    delete_jobs(
      clause,
      db
    ).then(function(data) {
      logger.info('/:id/delete/jobs DATA:', data);

      //
      var fileNamesArr = data.delete_jobs;
      var objects = [];
      if(fileNamesArr !== null && fileNamesArr.length !== 0) {
        fileNamesArr.forEach(fileName => {
          objects.push({ Key: fileName });
        });
        var params = {
            Bucket: S3_FILE_BUCKET,
            Delete: {
              Objects: objects
            }
        };
        // delete file from s3
        S3.deleteObjects(params, function(err, data) {
          // if there was an error deleting the s3 object then return 500
          if(err) {
            logger.log(create_log('error', ('/:id/delete/jobs S3 ERR: ' + err)));
            res.status(500).json({ message: 'Internal server error.' });
            return;
          }

          // log success and return success
          logger.info('/:id/delete/jobs S3 DATA: ', data);
        });
      }
      logger.info('/:id/delete/jobs: JOB(S) DELETED SUCCESSFULLY');
      res.status(200).json({ message: 'Success' });
    }, function(err) {
      logger.log(create_log('error', ('/:id/delete/jobs ERROR: ' + err)));
      // return status and message
      res.status(500).json({ message: 'Internal server error.' });
    });
  }
}));

/*
  delete a file
  body:
    required:
      - file_name - JSON array
      - jobs_id
*/
router.post('/:id/delete/file', checkIfAuthenticated, asyncHandler( (req, res, next) => {
  logger.info('/:id/delete/file BODY:', req.body);
  var user_id = parseInt(req.params.id);
  var file_name = req.body.file_name;
  var jobs_id = parseInt(req.body.jobs_id);

  logger.info(req.body.file_name.length);

  // check if any of the values are null or missing
  if(!is_valid_variable(user_id) || !is_valid_variable(file_name) || !is_valid_variable(jobs_id)) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
    return;
  } else if(req.body.file_name.length === 0) {
    // if values are empty then we don't have anything to delete
    res.status(400).json({ message: 'Bad request.' });
    return;
  // validate the user
  } else if(!id_matches(user_id, req.cookies.SESSIONID)) {
    res.status(401).json({ message: 'Unauthorized.' });
    return;
  // all is well
  } else {
    req.body.file_name.forEach(file => {
      var params = {
          Bucket: S3_FILE_BUCKET,
          Key: file
      };
      // call db function
      delete_file(file, jobs_id, db)
        // receive promise
        .then(function() {
          // delete file from s3
          S3.deleteObject(params, function(err, data) {
            // if there was an error deleting the s3 object then return 500
            if(err) {
              logger.log(create_log('error', ('/:id/delete/file ERR: ' + err)));
              res.status(500).json({ message: 'Internal server error.' });
              return;
            }

            // log s3 data
            logger.info('/:id/delete/file S3 DATA: ', data);
          });
        // on error then determine error
        }, function(err) {
          logger.log(create_log('error', ('/:id/delete/file ', err)));
          res.status(500).json({ message: 'Internal server error.' });
        });
    });

    // log success and return success
    logger.info('/:id/delete/file: FILE(S) DELETED SUCCESSFULLY');
    res.status(200).json({ message: 'Success' });
  }
}));

/*
  route to update a job
  body:
    require:
      - jobs_id
      - form_values object
*/
router.post('/:id/job/update', checkIfAuthenticated, asyncHandler( (req, res, next) => {
  var user_id = parseInt(req.params.id);
  var jobs_id = parseInt(req.body.jobs_id);
  var form_values = req.body.form_values;
  logger.info('/:id/job/update body.form_values:', form_values);

  // check if any of the values are null or missing
  if(!is_valid_variable(jobs_id) || !is_valid_variable(form_values)) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
    return;
  // check if parameter id matches the token id
  } else if(!id_matches(user_id, req.cookies.SESSIONID)) {
    res.status(401).json({ message: 'Unauthorized.' });
    return;
  // attempt to update a job
  } else {
    // call db function
    update_job(
      user_id,
      jobs_id,
      form_values.jobTitle,
      form_values.companyName,
      form_values.link,
      form_values.notes,
      form_values.files,
      JSON.stringify(form_values.existingContacts),
      JSON.stringify(form_values.newContacts),
      db
    ).then(function(data) {
      logger.info('/:id/job/update DATA:', data);
      // return status and message
      res.status(200).json({ message: 'Success.', data: data.update_job });
    }, function(err) {
      logger.log(create_log('error', ('/:id/job/update ERROR: ' + err)));
      // return status and message
      res.status(500).json({ message: 'Internal server error.' });
    });
  }
}));

/*
  route to update a users sharing settings
  body:
    required:
      - form_values object
*/
router.post('/:id/sharing/update', checkIfAuthenticated, asyncHandler( (req, res, next) => {
  var user_id = parseInt(req.params.id);
  var form_values = req.body.form_values;
  logger.info(form_values);

  // check if any of the values are null or missing
  if(!is_valid_variable(form_values)) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
    return;
  // check if parameter id matches the token id
  } else if(!id_matches(user_id, req.cookies.SESSIONID)) {
    res.status(401).json({ message: 'Unauthorized.' });
    return;
  // attempt to update user
  } else {

    let share_opportunities = (form_values.shareOpportunities == true || form_values.shareOpportunities == 1) ? 1 : 0;
    let share_applied = (form_values.shareApplied == true || form_values.shareApplied == 1) ? 1 : 0;
    let share_interviews = (form_values.shareInterviews == true || form_values.shareInterviews == 1) ? 1 : 0;
    let share_offers = (form_values.shareOffers == true || form_values.shareOffers == 1) ? 1 : 0;
    let is_private = (form_values.isPrivate == true || form_values.isPrivate == 1) ? 1 : 0;

    // call db function
    update_user_sharing(
      user_id,
      share_opportunities,
      share_applied,
      share_interviews,
      share_offers,
      is_private,
      db
    ).then(function(data) {
      logger.info('/:id/share/update DATA:', data);
      // return status and message
      res.status(200).json({ message: 'Success.', data: data });
    }, function(err) {
      logger.log(create_log('error', ('/:id/share/update ERROR: ' + err)));
      // return status and message
      res.status(500).json({ message: 'Internal server error.' });
    });
  }
}));

/*
  route to update a profile
  body:
    required:
      - form_values object
*/
router.post('/:id/profile/update', checkIfAuthenticated, asyncHandler( (req, res, next) => {
  var user_id = parseInt(req.params.id);
  var form_values = req.body.form_values;
  logger.info(form_values);

  // check if any of the values are null or missing
  if(!is_valid_variable(form_values)) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
    return;
  // check if parameter id matches the token id
  } else if(!id_matches(user_id, req.cookies.SESSIONID)) {
    res.status(401).json({ message: 'Unauthorized.' });
    return;
  // attempt to update user
  } else {

    user_exists(
      form_values.email,
      db
    ).then(data => {
      logger.info(data);
      if(data.result) {
        // return status and message
        res.status(409).json({ message: 'User exists.' });
        return;
      } else {
        // update profile
        update_user_profile(
          user_id,
          form_values.email,
          form_values.firstName,
          form_values.lastName,
          form_values.bio,
          db
        ).then(function(data) {
          logger.info('/:id/profile/update DATA:', data);
          // return status and message
          res.status(200).json({ message: 'Success.', data: data });
        }, function(err) {
          logger.log(create_log('error', ('/:id/profile/update ERROR: ' + err)));
          // return status and message
          res.status(500).json({ message: 'Internal server error.' });
        });
      }
    }, err => {
      logger.log(create_log('error', ('/:id/profile/update ERROR: ' + err)));
      // return status and message
      res.status(500).json({ message: 'Internal server error.' });
    });
  }
}));

/*
  route to delete a user
*/
router.post('/delete/:id', checkIfAuthenticated, asyncHandler( (req, res, next) => {
  var user_id = parseInt(req.params.id);

  // check if parameter id matches the token id
  if(!id_matches(user_id, req.cookies.SESSIONID)) {
    res.status(401).json({ message: 'Unauthorized.' });
    return;
  // attempt to delete user
  } else {
    delete_user(user_id, db)
      .then(data => {
        logger.info('/delete/:id DATA:', data);
        // return status and message
        res.status(200).json({ message: 'Success.' })
      }, err => {
        console.log('/delete/:id ERR:', err);
        logger.log(create_log('error', ('/delete/:id ERROR: ' + err)));
        // return status and message
        res.status(500).json({ message: 'Internal server error.' });
      });
  }
}));


// error handling
router.use(function (err, req, res, next) {
  logger.info('-----------------------------------------------');
  // logger.error("ERROR ROUTE:", err.stack);
  logger.info(err);
  if(err.status === 401) {
    res.status(401).json('Unauthorized.');
    return;
  } else {
    res.status(500).json('Internal server error.');
    return;
  }
  logger.info('-----------------------------------------------');
});

// missing routes
router.use(function (req, res, next) {
  logger.info('-----------------------------------------------');
  logger.info('404 route');
  logger.info(req.url);
  logger.info('-----------------------------------------------');
  res.status(404).json("Sorry can't find that!")
});

// prefix api
app.use('/api', router);

// listen to port
app.listen(port, () => logger.log(create_log('info', `App listening on port ${port}!`)));
