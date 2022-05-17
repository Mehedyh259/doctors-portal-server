const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');


const app = express();
const port = process.env.PORT || 5000;


// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@doctors-portal.lgpsw.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


const verifyToken = (req, res, next) => {
    const authHeader = req.headers?.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: "unauthorized accesss" });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        } else {
            req.decoded = decoded;
            next()
        }
    })
}



const run = async () => {
    try {
        await client.connect();
        console.log('Database Connected !!');
        const servicesCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query);
            const services = await cursor.toArray();

            res.status(200).send(services);
        });

        app.get('/user', verifyToken, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.status(200).send(users)
        })


        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user?.role === 'admin';
            res.send({ admin: isAdmin });
        })

        app.put('/user/admin/:email', verifyToken, async (req, res) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            const role = requesterAccount.role;
            if (role === 'admin') {
                const email = req.params.email;
                const filter = { email: email };
                const updatedDoc = {
                    $set: { role: 'admin' }
                }
                const result = await userCollection.updateOne(filter, updatedDoc);

                res.send({ result });
            } else {
                res.status(403).send({ message: 'forbidden' });
            }
        })
        app.put('/user/:email', async (req, res) => {
            const user = req.body
            const email = req.params.email;
            const filter = { email: email };
            const options = { upsert: true };

            const updatedDoc = {
                $set: user
            }
            const result = await userCollection.updateOne(filter, updatedDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_SECRET, { expiresIn: '1d' })

            res.send({ result, token });
        })


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

        app.get('/booking', verifyToken, async (req, res) => {

            const decodedEmail = req.decoded.email;
            const patient = req.query?.patient;


            if (patient === decodedEmail) {
                const query = { patient: patient }
                const bookings = await bookingCollection.find(query).toArray();
                return res.status(200).send(bookings);
            } else {
                res.status(403).send({ message: 'forbidded access' });
            }
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