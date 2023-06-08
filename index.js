const express = require("express");
const mysql = require("mysql2")
const app = express();
const cors = require("cors");
const crypto = require("crypto");

const PORT = 8080;

app.use(cors({
    methods: ['GET','POST','DELETE','UPDATE','PUT','PATCH']
}));

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

const connection = mysql.createPool({
    host: 'gateway01.us-east-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: '8fQiJvi8jQBZMD3.root',
    password: 'VhRD4nDFPlVlT3hs',
    database: 'todo',
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    },
    connectTimeout: 20000,
});

function hashPass(pass) {
    var hash = crypto.createHash('sha256');
    return hash.update(pass).digest('hex');
}

app.get('/api/user', (req, res) => {
    connection.query('SELECT p.id, p.full_name, p.email FROM account a, profile_data p WHERE a.using_status = 1 AND a.id = p.account_id', (err, data) => {
        if (err) {
            throw err;
        }
        res.send(data);
    })
})

app.post('/api/user/create', (req, res) => {
    const { username, email, full_name, pass } = req.body;

    const createMyTodoSpace = (id) => {
        connection.query(`INSERT INTO my_todo (profile_id) VALUE (${id})`, (err, result) => {
            if (err) {
                res.send({
                    statusCode: 500,
                    responseData: err
                })
            } else {
                if (result.affectedRows > 0) {
                    res.send({
                        statusCode: 200,
                        responseData: 'Sign Up Successfully'
                    })
                }
            }
        })
    }

    const createNewProfile = (id) => {
        connection.query(`INSERT INTO profile_data (full_name, email, account_id) VALUE ('${full_name}', '${email}', ${id})`, (err, result) => {
            if (err) {
                res.send({
                    statusCode: 500,
                    responseData: err
                })
            } else {
                if (result.affectedRows > 0) {
                    createMyTodoSpace(id);
                }
            }
        })
    }

    const createNewAccount = () => {
        connection.query(`INSERT INTO account (username, pass, using_status) VALUE ('${username}', '${hashPass(pass)}', 0)`, (err, result) => {
            if (err) {
                res.send({
                    statusCode: 500,
                    responseData: err
                })
            } else {
                if (result.affectedRows > 0) {
                    const account_id = result.insertId;
                    createNewProfile(account_id);
                }
            }
        })
    }

    const checkExistedUsername = () => {
        connection.query(`SELECT * FROM account WHERE username='${username}'`, (err, result) => {
            if (err) {
                res.send({
                    statusCode: 500,
                    responseData: err
                })
            } else {
                if (result.length > 0) {
                    res.send({
                        statusCode: 400,
                        responseData: 'Your username is existed. Please choose another username'
                    })
                } else {
                    createNewAccount();
                }
            }
        })
    }

    if (username.trim() === '' || email.trim() === '' || full_name.trim() === '' || pass.trim() === '') {
        res.send({
            statusCode: 500,
            responseData: 'Please fill in all fields'
        })
    } else {
        checkExistedUsername();
    }
})

app.post('/api/user/login', (req, res) => {
    const username = req.body.username;
    const password = hashPass(req.body.password);
    connection.query(`SELECT p.id, p.full_name, p.email FROM account a, profile_data p WHERE username='${username}' AND pass='${password}' AND a.id = p.account_id`, (err, data) => {
        if (err) {
            res.send({
                statusCode: 500,
                responseData: err,
            })
        } else {
            const userData = data;
            if (userData.length > 0) {
                connection.query(`UPDATE account SET using_status=1 WHERE username='${username}'`, (err, result) => {
                    if (err) {
                        res.status(500).json("Error when signin")
                    } else {
                        if (result.affectedRows > 0) {
                            res.send({
                                statusCode: 200,
                                responseData: 'Sign In Successfully',
                                userData: userData[0],
                            })
                        }
                    }
                })
            } else {
                res.send({
                    statusCode: 404,
                    responseData: 'Username or password is incorrect',
                })
            }
        }
    })
})

app.get('/api/todo/all', (req, res) => {
    const profile_id = req.query.profile_id;
    const search_input = req.query.search_input;
    const all = req.query.all === 'true' ? true : false;
    const active = req.query.active  === 'true' ? true : false;
    const completed = req.query.completed  === 'true' ? true : false;
    const expired = req.query.expired  === 'true' ? true : false;

    const filterByTodoName = (todos) => {
        if (search_input !== '') {
            const todoList = todos.filter(todo => todo.todo_name.toLowerCase().includes(search_input.toLowerCase()))
            res.send({
                statusCode: 200,
                responseData: todoList
            })
        } else {
            res.send({
                statusCode: 200,
                responseData: todos
            })
        }
    }

    const getTodoList = () => {
        connection.query(`SELECT t.id, t.todo_name, t.created_at, t.deadline, t.is_active, t.is_completed FROM my_todo m, todo_detail t WHERE m.id = t.my_todo_id AND m.profile_id=${profile_id} ORDER BY t.deadline DESC`, (err, result) => {
            if (err) {
                res.send({
                    statusCode: 500,
                    responseData: err.toString()
                })
            } else {
                filterByTodoName(result)
            }
        })
    }

    const getActiveTodoList = () => {
        const now = new Date();
        connection.query(`SELECT t.id, t.todo_name, t.created_at, t.deadline, t.is_active, t.is_completed FROM my_todo m, todo_detail t WHERE m.id = t.my_todo_id AND m.profile_id=${profile_id} AND t.is_active=1 AND t.is_completed=0 ORDER BY t.deadline DESC`, (err, result) => {
            if (err) {
                res.send({
                    statusCode: 500,
                    responseData: err.toString()
                })
            } else {
                const activeResult = result.filter(item => {
                    const deadline = new Date(Date.parse(item.deadline));
                    return deadline > now
                });
                filterByTodoName(activeResult)
            }
        })
    }

    const getCompletedTodoList = () => {
        connection.query(`SELECT t.id, t.todo_name, t.created_at, t.deadline, t.is_active, t.is_completed FROM my_todo m, todo_detail t WHERE m.id = t.my_todo_id AND m.profile_id=${profile_id} AND t.is_completed=1 AND t.is_active=0 ORDER BY t.deadline DESC`, (err, result) => {
            if (err) {
                res.send({
                    statusCode: 500,
                    responseData: err.toString()
                })
            } else {
                filterByTodoName(result)
            }
        })
    }

    const getExpiredTodoList = () => {
        const now = new Date();
        connection.query(`SELECT t.id, t.todo_name, t.created_at, t.deadline, t.is_active, t.is_completed FROM my_todo m, todo_detail t WHERE m.id = t.my_todo_id AND m.profile_id=${profile_id} AND t.is_completed=0 AND t.is_active=1 ORDER BY t.deadline DESC`, (err, result) => {
            if (err) {
                res.send({
                    statusCode: 500,
                    responseData: err.toString()
                })
            } else {
                const expiredResult = result.filter(item => {
                    const deadline = new Date(Date.parse(item.deadline));
                    return deadline < now
                });
                filterByTodoName(expiredResult);
            }
        })
    }

    if (all) {
        getTodoList();
        return;
    }
    if (active) {
        getActiveTodoList();
        return;
    }
    if (completed) {
        getCompletedTodoList();
        return;
    }
    if (expired) {
        getExpiredTodoList();
        return;
    }
})

app.post('/api/todo/new', (req, res) => {
    const todo = req.body.todo;
    const profile_id = req.body.profile_id;
    const deadline = req.body.deadline;
    if (todo === '' || deadline === '') {
        res.send({
            statusCode: 400,
            responseData: 'Please fill todo data'
        })
    } else {
        connection.query(`SELECT id FROM my_todo WHERE profile_id=${profile_id}`, (err, result) => {
            if (err) {
                res.status(500).json('Server is die')
            }
            const my_todo_id = result[0].id;
            const date = new Date();
            const convertedDate = `${date.getUTCFullYear()}/${date.getMonth()+1}/${date.getDate()}`
            connection.query(`INSERT INTO todo_detail (todo_name, created_at, is_active, is_completed, deadline, my_todo_id) VALUE ('${todo}', '${convertedDate}', 1, 0, '${deadline}' ,${my_todo_id})`, (err, result) => {
                if (err) {
                    res.status(500).json(err.toString());
                } else {
                    if (result.affectedRows > 0) {
                        res.send({
                            statusCode: 200,
                            responseData: 'Add new todo successfully'
                        })
                    }
                }
            })
        })
    }
})

app.put('/api/todo/update', (req, res) => {
    const is_completed = req.body.is_completed;
    const id = req.body.id;
    connection.query(`UPDATE todo_detail SET is_completed = ${is_completed ? 1 : 0}, is_active = ${is_completed ? 0 : 1} WHERE id=${id}`, (err, result) => {
        if (err) {
            res.send({
                statusCode: 500,
                responseData: err.toString()
            })
        } 
        if (result.affectedRows > 0) {
            res.send({
                statusCode: 200,
                responseData: 'Update work successfully'
            })
        }
    })
})

app.put('/api/todo/detail/update', (req, res) => {
    const id = req.body.id;
    const todo_name = req.body.todo_name;
    const deadline = req.body.deadline;

    const formattedDate = date => {
        const converted = new Date(Date.parse(date));
        return `${converted.getUTCFullYear()}/${converted.getMonth()+1}/${converted.getDate()}`;
    }

    connection.query(`UPDATE todo_detail SET todo_name = '${todo_name}', deadline = '${formattedDate(deadline)}' WHERE id=${id}`, (err, result) => {
        if (err) {
            res.send({
                statusCode: 500,
                responseData: err.toString()
            })
        } 
        if (result.affectedRows > 0) {
            res.send({
                statusCode: 200,
                responseData: 'Update todo name successfully'
            })
        }
    })
})

app.delete('/api/todo/delete', (req, res) => {
    const id = req.query.id;
    connection.query(`DELETE FROM todo_detail WHERE id=${id}`, (err, result) => {
        if (err) {
            res.send({
                statusCode: 500,
                responseData: err.toString()
            })
        } else {
            if (result.affectedRows > 0) {
                res.send({
                    statusCode: 200,
                    responseData: 'Delete work successfully'
                })
            }
        }
    })
})

app.put('/api/user/signout', (req, res) => {
    connection.query(`UPDATE account SET using_status=0`, (err, result) => {
        if (err) {
            res.send({
                statusCode: 500,
                responseData: err
            })
        } else {
            if (result.affectedRows > 0) {
                res.send({
                    statusCode: 200,
                    responseData: 'Sign Out Successfully'
                })
            }
        }
    })
})

app.listen(PORT, () => {
    console.log('Server is listening on', PORT);
})