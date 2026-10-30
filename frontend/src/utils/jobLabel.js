import { siteLabel } from './format.js';

// "Client - Site (job card ref)" - used wherever you pick or show a job by name
export const jobLabel = (j) =>
  `${(j.client && j.client.name) || ''} - ${siteLabel(j.site)}${j.jobCardRef ? ` (${j.jobCardRef})` : ''}`;