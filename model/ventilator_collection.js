
    const mongoose = require('mongoose');
    const device = require('./device')
    const logs = require('./logs')
    
        const schemaOptions = {
            timestamps: true,
            toJSON: {
                virtuals: false
            },
            toObject: {
                virtuals: false
            }
        }
        
        const ventilator_collectionSchema = new mongoose.Schema(
            {
                did:{
                    type:String,
                    requuired:[true,'did is required.']

                },
                version: {
                    type: String,
                    required: [true, 'Log version is required.']
                },
                type: {
                  type: String,
                  enum: ["001","002"],
                  required: [true, "Atleast one model required."]
                },
                device:{ type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
                log:logs
            },
            schemaOptions
        )

        ventilator_collectionSchema.index({'type': 1})
                
        const ventilator_collection = mongoose.model('ventilator_collection', ventilator_collectionSchema);
        
        module.exports = ventilator_collection
        