// API URL - automatically uses relative path in production
const API_URL = import.meta.env.PROD ? '/api' : 'http://localhost:3000/api';

export default API_URL;
