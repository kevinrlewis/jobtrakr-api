module.exports = function(user_id, jobs_id, job_type_id, db) {
  return new Promise(function(resolve, reject) {
    // run get_opportunities_by_user_id function
    // to grab all of the opportunities tied to a specific user
    db.one('select update_job_type(${user_id}, ${jobs_id}, ${job_type_id})',
    {
      user_id: user_id,
      jobs_id: jobs_id,
      job_type_id: job_type_id
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
