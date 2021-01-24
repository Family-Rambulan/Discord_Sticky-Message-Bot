const sql = require("sqlite3").verbose();

// Keep trying until we can open the database, this bot won't work without it
let db = null;
let dbOpened = false;
(function OpenDB()
{
    db = new sql.Database("./bot.db", (error) => {
        if (error != null)
        {   
            setTimeout(OpenDB, 2000);
            console.error(error.message);
        }
        else
        {
            dbOpened = true;
            db.serialize(() => {
                db.get("SELECT name FROM sqlite_master WHERE name = 'stickies'", (error, value) => {
                    if (error != null)
                        return console.error(error.message);

                    if (value == null) // Table doesn't exist, create it
                        db.run("CREATE TABLE stickies(id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, server_id TEXT NOT NULL, channel_id TEXT NOT NULL, sticky_id INTEGER NOT NULL, message TEXT NOT NULL)");
                });
            });
        }  
    }); 
}());
const DB_ERROR = "Attempts to open the database have been unsuccessful, try again later..";

class Stickies 
{
    constructor()
    {
        this.stickies = null;
    }

    InitStickies(server_id, channel_id)
    {
        if (!this.stickies)
            this.stickies = new Object();

        if (server_id != null)
        {
            if (!this.stickies[server_id])
                this.stickies[server_id] = new Object();

            if (channel_id != null && !this.stickies[server_id][channel_id])
                this.stickies[server_id][channel_id] = new Array();
        }
    }

    LoadStickies(servers, cb)
    {   
        if (db == null || !dbOpened)
            return;

        // // Commented out for now, as a risk of Discord outages may cause this to wipe important data
        // db.parallelize(() => {
        //     // Remove entries for non-existent channels for each server
        //     const valid_server_ids = new Array();
        //     for (const [valid_server_id, valid_server] of servers.cache)
        //     {   
        //         valid_server_ids.push(valid_server_id);

        //         const valid_channel_ids = new Array();
        //         let invalid_channel_sql = `DELETE FROM stickies WHERE server_id = ${valid_server_id} AND channel_id NOT IN(`;
    
        //         for (const [valid_channel_id, valid_channel] of valid_server.channels.cache)
        //         {
        //             if (valid_channel.type == "text")
        //                 valid_channel_ids.push(valid_channel_id);
        //         }
    
        //         invalid_channel_sql += valid_channel_ids.toString() + ")";
        //         db.run(invalid_channel_sql, (error) => {
        //             if (error != null)
        //                 console.error(error.message);
        //         });
        //     }

        //     // Remove entries for unavailable servers
        //     db.run(`DELETE FROM stickies WHERE server_id NOT IN (${valid_server_ids.toString()})`, (error) => {
        //         if (error != null)
        //             console.error(error.message);
        //     });
        // });

        // Load ALL SQL data into array (THIS WOULD CERTAINLY HIT SOME LIMITS IF THIS WERE A POPULAR BOT)
        this.InitStickies();
        db.each("SELECT * FROM stickies", (error, value) => {
            if (error != null)
                return console.error(error.message);

            const server_id = value.server_id;
            const channel_id = value.channel_id;
            const sticky_id = value.sticky_id;
            const message = value.message;
            if (server_id != null && channel_id != null && sticky_id != null && message != null)
            {
                this.InitStickies(server_id, channel_id);
                this.stickies[server_id][channel_id][sticky_id - 1] = new Object({"server_id" : server_id, "channel_id" : channel_id, "message" : message});
            }
        }, () => {
            cb();
        });
    }

    AddSticky(server_id, channel_id, message, cb) // Add sticky to sticky array and database stickies
    {   
        if (db == null || !dbOpened)
            return cb(DB_ERROR);

        if (this.stickies == null)
            return cb(false);

        this.InitStickies(server_id, channel_id);
          
        let stickyCount = this.stickies[server_id][channel_id].length + 1;
        db.run("INSERT INTO stickies VALUES(NULL, ?, ?, ?, ?)", [server_id, channel_id, stickyCount, message], (error) => {
            if (error)
                cb(`Database action to insert a new value failed. (${error})`);
            else
                cb(this.stickies[server_id][channel_id].push(new Object({"server_id" : server_id, "channel_id" : channel_id, "message" : message})));
        });
    }

    EditSticky(server_id, channel_id, sticky_id, discord_message, cb) // Modify existing sticky in channel
    {
        if (db == null || !dbOpened)
            return cb(DB_ERROR);

        if (this.stickies == null)
            return cb(false);

        if (this.stickies[server_id] && this.stickies[server_id][channel_id] && this.stickies[server_id][channel_id][sticky_id - 1])
        {
            this.stickies[server_id][channel_id][sticky_id - 1].message = discord_message;
            db.run("UPDATE stickies SET message = ? WHERE server_id = ? AND channel_id = ? AND sticky_id = ?", 
                [discord_message, server_id, channel_id, sticky_id], (error) => {
                    if (error != null)
                        return cb(error.message);
                    else
                        return cb(true);
                }
            );
        }
        else
            cb(false);
    }

    RemoveSticky(server_id, channel_id, sticky_id, cb) // Remove specific sticky 
    {   
        if (db == null || !dbOpened)
            return cb(DB_ERROR);

        if (this.stickies == null)
            return cb(false);
        if (this.stickies[server_id] && this.stickies[server_id][channel_id]) 
        {
            const ele = this.stickies[server_id][channel_id][sticky_id - 1];
            if (ele != null && ele != -1)
            {   
                this.stickies[server_id][channel_id].splice(sticky_id - 1, 1);

                db.serialize(() => { 
                    db.run("DELETE FROM stickies WHERE server_id = ? AND channel_id = ? AND sticky_id = ?", [server_id, channel_id, sticky_id], (error) => {
                        if (error != null)
                            return cb(`Couldn't delete that sticky from the database (${error.message})`);
                    });

                    // Decrement all sticky_ids after the removed one (So it remains numbered 1,2,3):
                    db.run("UPDATE stickies SET sticky_id = sticky_id - 1 WHERE server_id = ? AND channel_id = ? AND sticky_id > ?", [server_id, channel_id, sticky_id], (error) => {
                        if (error != null)
                            console.error(error.message);
                        else
                            cb(true);
                    });
                });
            }
            else
                cb(false);
        }
    }

    RemoveChannelStickies(server_id, channel_id, cb) // Remove all stickies from a channel
    {
        if (this.stickies[server_id] && this.stickies[server_id][channel_id])
        {
            if (this.stickies[server_id][channel_id].length <= 0)
                return cb(false);
    
            this.stickies[server_id][channel_id].length = 0;
            db.run("DELETE FROM stickies WHERE server_id = ? AND channel_id = ?", [server_id, channel_id], (error) => {
                cb();
            });
        }
    }

    RemoveServerStickies(server_id, cb)
    {
        if (this.stickies[server_id])
        {
            delete this.stickies[server_id];
            db.run("DELETE FROM stickies WHERE server_id = ?", [server_id], (error) => {
                cb();
            });
        }
    }

    ValidStickyChannel(server_id, channel_id)
    {
        return this.stickies != null && this.stickies[server_id] != null && this.stickies[server_id][channel_id] != null;
    }

    GetStickies(server_id, channel_id) // Without channel_id, get all channels that have stickies, otherwise get all stickies in channel
    {
        if (db == null || !dbOpened)
            return DB_ERROR;

        if (this.stickies == null || this.stickies[server_id] == null)
            return false;

        if (channel_id == null)
        {
            let channelIDs = new Array();
            for (let [key, value] of Object.entries(this.stickies[server_id]))
            {   
                channelIDs.push(new Object({
                    "server_id" : key,
                    "count" : value.length
                }));
            }
            
            return channelIDs;
        }
        else
        {
            return this.stickies[server_id][channel_id];
        }
    }

    set stickies(stickies)
    {
        this._stickies = stickies;
    }

    get stickies()
    {
        return this._stickies;
    }
}

module.exports = { Stickies };