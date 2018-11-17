const logt = 'login_user:';
var user_exists = require('./user_exists.js');

module.exports = function(email, password, db) {
  return new Promise(function(resolve, reject) {
    // check if the user exists
    user_exists(email, db)
      .then(function(data) {
        console.log(logt, "data:", data);
        // if the user exists then attempt to validate password
        if(data.result) {
          db.one('select validate_user(${email}, ${password})',
          {
            email: email,
            password: password
          })
            // on successful query, resolve response
            .then(function(res) {
              console.log(logt, "query data: ", res);
              resolve(res);
            })
            // on query error, reject and relay the error
            .catch(function(error) {
              console.log(logt, "query error: ", error);
              reject(error);
            });
        // if the user does not exists, then they need to sign up
        } else {
          reject({ message: 'user_does_not_exist' });
        }
      // if some error occurs
      }, function(err) {
        console.log(logt, "error:", err);
        reject(err);
      });
  });
}
