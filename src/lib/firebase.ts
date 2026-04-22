import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import firebaseConfig from '../../firebase-applet-config.json';

// Ensure databaseURL is present or construct a default guess if possible (though explicit is better)
const config = {
  ...firebaseConfig,
  databaseURL: (firebaseConfig as any).databaseURL || `https://${firebaseConfig.projectId}-default-rtdb.europe-west1.firebasedatabase.app`
};

const app = initializeApp(config);
export const db = getDatabase(app);
export const auth = getAuth(app);
