module.exports = function(
  job_title,
  company_name,
  link,
  notes,
  type,
  attachments,
  user_id,
  db
) {
  return new Promise(function(resolve, reject) {
    // run create user function
    db.one('select insert_job(${job_title}, ${company_name}, ${link}, ${notes}, ${type}, ${attachments}, ${user_id})',
    {
      job_title: job_title,
      company_name: company_name,
      link: link,
      notes: notes,
      type: type,
      attachments: attachments,
      user_id: user_id
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
