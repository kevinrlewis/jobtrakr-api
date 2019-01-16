module.exports = function(
  jobs_id_clause,
  db
) {
  return new Promise(function(resolve, reject) {
    // run create user function
    db.one('select delete_jobs(${jobs_id_clause})',
    {
      jobs_id_clause: jobs_id_clause
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
