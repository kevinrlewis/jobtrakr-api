module.exports = function(email, password, firstname, lastname, db) {
  return new Promise(function(resolve, reject) {
    // check if user exists already
    db.one('select user_exists($1)', email)
      // on successful query
      .then(function(data) {
        // check if the return from user_exists query returns null
        // if so then a user should be created
        if(data.user_exists === null) {
          // run create user function
          db.one('select create_user(${email}, ${password}, ${firstname}, ${lastname})',
          {
            email: email,
            password: password,
            firstname: firstname,
            lastname: lastname
          })
            // on successful insertion resolve promise
            .then(function(data) {
              resolve();
            })
            // on query error, reject and return error
            .catch(function(error) {
              console.log('ERROR:', error);
              reject(Error(error));
            });
        // if user already exists, meaning query returned a value
        // reject displaying the user_exists
        } else {
          reject({ message: 'user_exists'} );
        }
      })
      // on query error, reject and return error
      .catch(function(error) {
        console.log('ERROR:', error);
        reject(Error(error));
      });
  });
}
