fetch('https://api.resend.com')
  .then((res) => console.log('SUCCESS — status:', res.status))
  .catch((err) => console.log('FAILED — error:', err.message));