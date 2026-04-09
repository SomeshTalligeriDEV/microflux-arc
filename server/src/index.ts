import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import intentRoutes from './routes/intent.routes';


dotenv.config();

const app: Express = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'active', message: 'MicroFlux Engine is running.' });
});

//intent parsing route
app.use('/api/intent', intentRoutes);


app.listen(port, () => {
  console.log(`[server]: MicroFlux Engine is running at http://localhost:${port}`);
});