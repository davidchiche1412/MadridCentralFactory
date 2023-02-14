import express from "express";
import bodyParser from "body-parser";
import { createClient } from 'redis';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();
console.log(process.env.REDIS_PASSWORD)

const url = '';
const redisClient = createClient({
    url,
    password: ''
});
redisClient.on('error', (err) => console.log('Redis Client Error', err));

const HOSTNAME = '127.0.0.1';
const PORT = 3001;
const app = express();
const allowedOrigins = ['http://localhost:3000'];

app.use(cors({
    origin: function(origin, callback){
      // allow requests with no origin (eg: mobile)
      if(!origin) return callback(null, true);
      if(allowedOrigins.indexOf(origin) === -1){
        var msg = 'The CORS policy for this site does not ' +
                  'allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    }
  }));


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

app.get('/', async (request, response) => {

    try {
        const parsed_adrress = formatAddress(request.query.address)
        console.log("INFO: checking if " + parsed_adrress + " exists in DB...");

        await redisClient.connect();
        const value = await redisClient.json.get(parsed_adrress);
        if(value){
            console.log("INFO: value found on DB, returning... ", value);
            response.statusCode = 200;
            response.send(value);
        }else{
            console.log("INFO: NOT value found on DB");
            response.statusCode = 404;
            response.send("Not found");
        }

    }catch (error){
        console.log("ERROR: " + error);
        response.statusCode = 500;
        response.send("Something went wrong");
    }
    await redisClient.quit();

});

app.post('/', async (request, response) => {
    try {
        let lat = request.body.lat
        let long = request.body.long
        let address = request.body.address
        let inside = request.body.inside

        const parsed_adrress = formatAddress(address)

        console.log("INFO: setting  " + parsed_adrress + " in DB...")

        await redisClient.connect();

        const value = await redisClient.json.set(parsed_adrress, '.', {lat: lat, long:long, inside: inside});
        console.log("INFO: " + parsed_adrress + " setted SUCCESSFULLY!")

        response.statusCode = 200;
        response.send("OK");

    } catch (error) {
        console.log("ERROR: " + error)
        response.statusCode = 400;
        response.send(error);
    }  
    await redisClient.quit();
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
    
    address = address.replace(/[.,]/g, '').toLowerCase().trim()

    let formatted_address = []
    address.split(' ').forEach(function(word) {
        if(replaceWords[word]) {
            formatted_address.push(replaceWords[word])
            return
        }
        formatted_address.push(word)
    })
    return formatted_address.join(' ')

}

app.listen(PORT, function (err) {
    if (err){
        console.log('Something was wrong', err)
    } else {
        console.log(`Server running on ${PORT}`);
    }
});
