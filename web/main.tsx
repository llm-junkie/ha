import {createRoot} from 'react-dom/client';
import Home from '../app/page';
import '../app/globals.css';
import { startPwa } from '../app/pwa';
startPwa();
createRoot(document.getElementById('root')!).render(<Home/>);
