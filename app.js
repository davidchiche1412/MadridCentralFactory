import express from "express";
import { createClient } from 'redis';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const redisClient = createClient({
    url: `redis://${process.env.REDIS_USERNAME}:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOSTNAME}:${process.env.REDIS_PORT}`
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
await redisClient.connect();

const PORT = 3001;
const app = express();
const allowedOrigins = ['https://visionary-narwhal-25c249.netlify.app', 'https://madridcentral.org'];

app.use(cors({
    origin: function(origin, callback){
      if(!origin) return callback(null, true);
      if(allowedOrigins.indexOf(origin) === -1){
        const msg = 'The CORS policy for this site does not ' +
                  'allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    }
  }));


app.use(express.json());
app.use(express.urlencoded({extended:true}));

app.get('/', async (request, response) => {

    try {
        if (!request.query.address || typeof request.query.address !== 'string') {
            return response.status(400).send("Missing address parameter");
        }

        const parsed_address = formatAddress(request.query.address)
        console.log("INFO: checking if " + parsed_address + " exists in DB...");

        const value = await redisClient.json.get(parsed_address);
        if(value){
            console.log("INFO: value found on DB, returning... ", value);
            response.status(200).json(value);
        }else{
            console.log("INFO: NOT value found on DB");
            response.status(404).send("Not found");
        }

    }catch (error){
        console.log("ERROR: " + error);
        response.status(500).send("Something went wrong");
    }

});

app.post('/', async (request, response) => {
    try {
        const { lat, long, address, inside } = request.body;

        if (!address || typeof address !== 'string') {
            return response.status(400).send("Missing address");
        }
        if (typeof inside !== 'boolean') {
            return response.status(400).send("Missing or invalid 'inside' field");
        }

        const parsed_address = formatAddress(address)

        console.log("INFO: setting  " + parsed_address + " in DB...")

        const existing = await redisClient.json.get(parsed_address);

        if (existing && (existing.lat == null || existing.long == null) && lat != null && long != null) {
            console.log("INFO: updating " + parsed_address + " with missing lat/long...")
            await redisClient.json.set(parsed_address, '.', {lat: Number(lat), long: Number(long), inside: existing.inside});
        } else if (!existing) {
            await redisClient.json.set(parsed_address, '.', {lat: Number(lat), long: Number(long), inside: inside});
        }

        console.log("INFO: " + parsed_address + " setted SUCCESSFULLY!")

        response.status(200).send("OK");

    } catch (error) {
        console.log("ERROR: " + error)
        response.status(400).send("Bad request");
    }
});


function formatAddress(address){

    const replaceWords = {
        'cl': 'calle',
        'c': 'calle',
        'c/': 'calle',
        'av': 'avenida',
        'plz': 'plaza',
        'pl': 'plaza',
        'cta': 'carretera',
        'p': 'paseo',
        'pº': 'paseo'
      }
    
    address = String(address).replace(/<[^>]*>/g, '').replace(/[.,]/g, '').toLowerCase().trim().slice(0, 200)

    return address.split(' ').map(word => replaceWords[word] || word).join(' ')

}

app.listen(PORT, function (err) {
    if (err){
        console.log('Something was wrong', err)
    } else {
        console.log(`Server running on ${PORT}`);
    }
});
