import { useEffect, useState } from 'react';
import api from '../api/axios';
import { siteLabel } from './format.js';

// Looks up a site's name from its id (for jobs that cover several sites)
export function useSiteNames() {
  const [names, setNames] = useState({});
  useEffect(() => {
    api
      .get('/sites')
      .then((res) => {
        const map = {};
        res.data.forEach((s) => {
          map[s._id] = siteLabel(s);
        });
        setNames(map);
      })
      .catch(() => {});
  }, []);
  return (id) => names[String((id && id._id) || id)] || 'Site';
}