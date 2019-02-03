module.exports = function(amount, db) {
  return new Promise(function(resolve, reject) {
    // run create user function
    db.one('select get_users(${amount})',
    {
      amount: amount
    })
      // on successful insertion resolve promise
      .then(function(data) {
        resolve(data);
      })
      // on query error, reject and return error
      .catch(function(error) {
        console.log('ERROR:', error);
        reject(Error(error));
      });
  });
}
