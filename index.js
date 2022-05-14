const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');



const app = express();
const port = process.env.PORT || 5000;


// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@doctors-portal.lgpsw.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });




const run = async () => {
    try {
        await client.connect();
        console.log('Database Connected !!');
        const servicesCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');


        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query);
            const services = await cursor.toArray();

            res.status(200).send(services);
        });

        app.get('/available', async (req, res) => {
            const date = req?.query?.date;
            // get all services
            const services = await servicesCollection.find().toArray();
            //  get the booking of that day
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            services.forEach((service) => {
                const serviceBookings = bookings.filter((book) => book.treatment === service.name);
                const bookedSlots = serviceBookings.map(book => book.slot);
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                service.slots = available;


            })



            res.send(services)


        });


        /**
         * API NAMING CONVENTION
         * app.get('/booking') //get all bookings in this collection or more than one
         * app.get('/booking/:id') //get a specifik booking
         * app.post('/booking/') // add new booking
         * app.patch('/booking/:id') //update
         */

        app.get('/booking', async (req, res) => {
            const patient = req.query?.patient;
            const query = { patient: patient }
            const bookings = await bookingCollection.find(query).toArray();
            res.send(bookings);
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = {
                treatment: booking.treatment,
                date: booking.date,
                patient: booking.patient
            }

            const exist = await bookingCollection.findOne(query);

            if (exist) {
                return res.send({ success: false, booking: exist });
            }
            const result = await bookingCollection.insertOne(booking);
            return res.status(200).send({ success: true, result });
        });




    } finally {

    }
}
run().catch(console.dir);







app.get('/', (req, res) => {
    res.send("Doctors portal server");
});

app.listen(port, () => console.log('Server Running port: ', port));