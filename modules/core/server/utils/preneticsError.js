/**
 * Created by Al on 15/06/2016.
 */
// Require our core node modules.

'use strict';
var util = require( "util" );
var MongooseError = require('mongoose/lib/error');

// Export the constructor function.
exports.Prenetics = Prenetics;

// Export the factory function for the custom error object. The factory function lets
// the calling context create new Prenetics instances without calling the [new] keyword.
exports.createPreneticsError = createPreneticsError;


// ----------------------------------------------------------------------------------- //
// ----------------------------------------------------------------------------------- //


// I create the new instance of the Prenetics object, ensureing that it properly
// extends from the Error class.
/**
 *
 * @param settings - string or Error
 * @param userMessage - custom message
 * @returns {Prenetics}
 */
function createPreneticsError( settings, userMessage ) {
    if(typeof settings === 'string'){ // just has message
        var formatSetting = {message: settings, userMessage : settings};
        settings = formatSetting;
    }else if(settings instanceof Error){
        settings.errorCode = '4000';
        settings.internalMessage = settings.message;
        settings.userMessage = userMessage || settings.message;
    }else if(!!userMessage){
        settings.userMessage = userMessage;
    }


    return( new Prenetics( settings, createPreneticsError ) );

}

// {
//     "status":"",  /* required, string */
//     "userMessage":"",    /* required, string */
//     "internalMessage":"",
//     "data":{}
// }

// I am the custom error object for the application. The settings is a hash of optional
// properties for the error instance:
// --
// * type: I am the type of error being thrown.
// * message: I am the reason the error is being thrown.
// * detail: I am an explanation of the error.
// * extendedInfo: I am additional information about the error context.
// * errorCode: I am a custom error code associated with this type of error.
// -- errorCode list
// like http status code, but not that code
// 2xxx: is good
// 3000: is ask client side to do action
//      3001: room not exist -> let client jump to room list. might pass the suggestion in data field
// 4000: error
// --
// The implementationContext argument is an optional argument that can be used to trim
// the generated stacktrace. If not provided, it defaults to Prenetics.
function Prenetics( settings, implementationContext ) {

    // Ensure that settings exists to prevent refernce errors.
    settings = ( settings || {} );

    // Override the default name property (Error). This is basically zero value-add.
    this.name = "Prenetics";

    // Since I am used to ColdFusion, I am modeling the custom error structure on the
    // CFThrow functionality. Each of the following properties can be optionally passed-in
    // as part of the Settings argument.
    // --
    // See CFThrow documentation: https://wikidocs.adobe.com/wiki/display/coldfusionen/cfthrow
    this.type = ( settings.type || "Prenetics" );
    this.status = ( settings.status || "failure" );

    this.userMessage = ( settings.userMessage || "An error occurred." );
    this.internalMessage = ( settings.internalMessage || "An error occurred.(no internal message)" );
    this.message = ( settings.message || this.userMessage ||"An error occurred." );

    // this.detail = ( settings.detail || "" );
    // this.extendedInfo = ( settings.extendedInfo || "" );
    this.errorCode = ( settings.errorCode || 2000);
    this.data = ( settings.data || {} );

    // This is just a flag that will indicate if the error is a custom Prenetics. If this
    // is not an Prenetics, this property will be undefined, which is a Falsey.
    this.isPrenetics = true;

    // Capture the current stacktrace and store it in the property "this.stack". By
    // providing the implementationContext argument, we will remove the current
    // constructor (or the optional factory function) line-item from the stacktrace; this
    // is good because it will reduce the implementation noise in the stack property.
    // --
    // Rad More: https://code.google.com/p/v8-wiki/wiki/JavaScriptStackTraceApi#Stack_trace_collection_for_custom_exceptions
    Error.captureStackTrace( this, ( implementationContext || Prenetics ) );

}

util.inherits( Prenetics, Error );
