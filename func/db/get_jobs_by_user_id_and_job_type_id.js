module.exports = function(id, type_id, db) {
  return new Promise(function(resolve, reject) {
    // run get_opportunities_by_user_id function
    // to grab all of the opportunities tied to a specific user
    db.one('select get_jobs_by_user_id_and_job_type_id(${id}, ${type_id})',
    {
      id: id,
      type_id: type_id
    })
      // on success resolve promise
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
