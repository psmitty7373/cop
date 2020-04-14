const insert_chat = {
    type: 'object',
    properties: {
        text: {
            type: 'string',
            maxLength: 1024 * 512
        },
        channel_id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        type: {
            type: 'string',
            'enum': ['channel', 'user'],
        }
    },
    required: ['text', 'channel_id', 'type'],
    additionalProperties: false
}

const update_chat = {
    type: 'object',
    properties: {
        _id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        text: {
            type: 'string',
            maxLength: 1024 * 512
        }
    },
    required: ['_id', 'text'],
    additionalProperties: false
}

const get_old_chats = {
    type: 'object',
    properties: {
        start_from: {
            type: 'integer'
        },
        channel_id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
    },
    required: ['start_from', 'channel_id'],
    additionalProperties: false
}

const insert_chat_channel = {
    function: 'insertChatChannel',
    type: 'object',
    properties: {
        name: {
            type: 'string',
            maxLength: 32
        },
    },
    required: ['name'],
    additionalProperties: false
}

const insert_user = {
    type: 'object',
    properties: {
        username: {
            type: 'string',
            maxLength: 24,
            pattern: '^[a-zA-Z0-9_\.]{1,24}$'
        },
        name: {
            type: 'string',
            maxLength: 64
        },
        password: {
            type: 'string',
            maxLength: 64
        },
        is_admin: {
            type: 'boolean'
        }
    },
    required: ['username', 'name', 'password', 'is_admin'],
    additionalProperties: false
}

const update_user = {
    type: 'object',
    properties: {
        _id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        name: {
            type: 'string',
            maxLength: 64
        },
        password: {
            type: 'string',
            maxLength: 64
        },
        is_admin: {
            type: 'boolean'
        }
    },
    required: ['_id'],
    additionalProperties: false
}

const insert_mission = {
    type: 'object',
    properties: {
        name: {
            type: 'string',
            maxLength: 64
        }
    },
    required: ['name'],
    additionalProperties: false
}

const update_mission = {
    type: 'object',
    properties: {
        _id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        name: {
            type: 'string',
            maxLength: 64
        }
    },
    required: ['_id', 'name'],
    additionalProperties: false
}

const insert_mission_user = {
    type: 'object',
    properties: {
        user_id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        permissions: {
            type: 'object',
            properties: {
                manage_users: {
                    type: 'boolean'
                },
                write_access: {
                    type: 'boolean'
                },
                delete_access: {
                    type: 'boolean'
                },
                api_access: {
                    type: 'boolean'
                }
            },
            required: ['manage_users', 'write_access', 'delete_access', 'api_access'],
            additionalProperties: false
        }
    },
    required: ['user_id', 'permissions'],
    additionalProperties: false
}

const update_mission_user = {
    type: 'object',
    properties: {
        _id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        user_id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        permissions: {
            type: 'object',
            properties: {
                manage_users: {
                    type: 'boolean'
                },
                write_access: {
                    type: 'boolean'
                },
                delete_access: {
                    type: 'boolean'
                },
                api_access: {
                    type: 'boolean'
                }
            },
            required: ['manage_users', 'write_access', 'delete_access', 'api_access'],
            additionalProperties: false
        }
    },
    required: ['_id', 'permissions'],
    additionalProperties: false
}

const update_user_status = {
    type: 'object',
    properties: {
        status: {
            type: 'string',
            'enum': ['online', 'idle', 'offline'],
        },
    },
    required: ['status'],
    additionalProperties: false
}

const insert_note = {
    type: 'object',
    properties: {
        _id: {
            type: 'string',
        },
        name: {
            type: 'string',
            maxLength: 64
        }
    },
    optional: ['_id'],
    required: ['name'],
    additionalProperties: false
}

const update_note = {
    type: 'object',
    properties: {
        _id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        name: {
            type: 'string',
            maxLength: 64
        },
    },
    required: ['_id', 'name'],
    additionalProperties: false
};

const insert_file = {
    type: 'object',
    properties: {
        parent_id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        name: {
            type: 'string',
            maxLength: 64
        },
        type: {
            type: 'string',
            'enum': ['dir', 'file'],
        }
    },
    required: ['parent_id', 'name', 'type'],
    additionalProperties: false
}

const update_file = {
    type: 'object',
    properties: {
        _id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        parent_id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        name: {
            type: 'string',
            maxLength: 64
        },
    },
    required: ['_id', 'parent_id', 'name'],
    additionalProperties: false
};

const delete_file = {
    type: 'object',
    properties: {
        _id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        }
    },
    required: ['_id'],
    additionalProperties: false
};

const insert_event = {
    type: 'object',
    properties: {
        event_time: {
            type: 'string',
            pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[012][0-9]:[0-9][0-9]:[0-9][0-9]-[012][0-9]:[0-9][0-9]$'
        },
        discovery_time: {
            type: 'string',
            pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[012][0-9]:[0-9][0-9]:[0-9][0-9]-[012][0-9]:[0-9][0-9]$'
        },
        source_object: {
            type: 'string',
            pattern: '^$|^[a-fA-F0-9]{24}$'
        },
        dest_object: {
            type: 'string',
            pattern: '^$|^[a-fA-F0-9]{24}$'
        },
        source_port: {
            type: 'string',
            maxLength: 512
        },
        dest_port: {
            type: 'string',
            maxLength: 512
        },
        event_type: {
            type: 'string',
            maxLength: 512
        },
        short_desc: {
            type: 'string',
            maxLength: 1024 * 512
        },
        assigned_user_id: {
            type: 'string',
            pattern: '^$|^[a-fA-F0-9]{24}$'
        }
    },
    required: ['event_time', 'discovery_time'],
    additionalProperties: false
};

const update_event = {
    type: 'object',
    properties: {
        _id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        event_time: {
            type: 'string',
            pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[012][0-9]:[0-9][0-9]:[0-9][0-9]-[012][0-9]:[0-9][0-9]$'
        },
        discovery_time: {
            type: 'string',
            pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[012][0-9]:[0-9][0-9]:[0-9][0-9]-[012][0-9]:[0-9][0-9]$'
        },
        source_object: {
            type: 'string',
            pattern: '^$|^[a-fA-F0-9]{24}$'
        },
        dest_object: {
            type: 'string',
            pattern: '^$|^[a-fA-F0-9]{24}$'
        },
        source_port: {
            type: 'string',
            maxLength: 512
        },
        dest_port: {
            type: 'string',
            maxLength: 512
        },
        event_type: {
            type: 'string',
            maxLength: 512
        },
        short_desc: {
            type: 'string',
            maxLength: 1024 * 512
        },
        assigned_user_id: {
            type: 'string',
            pattern: '^$|^[a-fA-F0-9]{24}$'
        }
    },
    required: ['_id', 'event_time', 'discovery_time'],
    additionalProperties: false
};

const insert_opnote = {
    type: 'object',
    properties: {
        event_id: {
            type: 'string',
            pattern: '^$|^[a-fA-F0-9]{24}$'
        },
        opnote_time: {
            type: 'string',
            pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[012][0-9]:[0-9][0-9]:[0-9][0-9]-[012][0-9]:[0-9][0-9]$'
        },
        target: {
            type: 'string',
            maxLength: 1024
        },
        tool: {
            type: 'string',
            maxLength: 1024
        },
        action: {
            type: 'string',
            maxLength: 1024 * 512
        }
    },
    required: ['opnote_time', 'target', 'tool', 'action'],
    additionalProperties: false
};

const update_opnote = {
    type: 'object',
    properties: {
        _id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        event_id: {
            type: 'string',
            pattern: '^$|^[a-fA-F0-9]{24}$'
        },
        opnote_time: {
            type: 'string',
            pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[012][0-9]:[0-9][0-9]:[0-9][0-9]-[012][0-9]:[0-9][0-9]$'
        },
        target: {
            type: 'string',
            maxLength: 1024
        },
        tool: {
            type: 'string',
            maxLength: 1024
        },
        action: {
            type: 'string',
            maxLength: 1024 * 512
        }
    },
    required: ['_id', 'opnote_time', 'target', 'tool', 'action'],
    additionalProperties: false
};

const insert_object = {
    type: 'object',
    properties: {
        type: {
            type: 'string',
            'enum': ['link', 'icon', 'shape'],
            'if': {
                'properties': {
                    'type': {
                        'enum': ['link']
                    }
                }
            },
            'then': {
                'required': ['obj_a', 'obj_b']
            }
        },
        name: {
            type: 'string',
            maxLength: 1024
        },
        image: {
            type: 'string'
        },
        obj_a: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        obj_b: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        stroke_color: {
            type: 'string',
            pattern: '^$|^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$'
        },
        fill_color: {
            type: 'string',
            pattern: '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$'
        },
        locked: {
            type: 'boolean'
        },
        x: {
            type: 'number',
            minimum: -2000,
            maximum: 2000
        },
        y: {
            type: 'number',
            minimum: -2000,
            maximum: 2000
        },
        z: {
            type: 'number',
            minimum: 0
        }
    },
    required: ['type', 'name', 'image', 'fill_color', 'locked', 'x', 'y'],
    additionalProperties: true
};

const paste_objects = {
    type: 'object',
    properties: {
        _id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        x: {
            type: 'number',
            minimum: -2000,
            maximum: 2000
        },
        y: {
            type: 'number',
            minimum: -2000,
            maximum: 2000
        },
        z: {
            type: 'number',
            minimum: 0
        }
    },
    required: ['_id', 'x', 'y', 'z'],
    additionalProperties: true
};

const paste_object = {
    type: 'array',
    items: paste_objects
}

const change_object = {
    type: 'object',
    properties: {
        _id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        name: {
            type: 'string',
            maxLength: 1024
        },
        image: {
            type: 'string'
        },
        stroke_color: {
            type: 'string',
            pattern: '^$|^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$'
        },
        fill_color: {
            type: 'string',
            pattern: '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$'
        },
        locked: {
            type: 'boolean'
        },
    },
    required: ['name', 'image', 'fill_color', 'locked'],
    additionalProperties: true
};

const move_objects = {
    type: 'object',
    properties: {
        _id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        },
        scale_x: {
            type: 'number'
        },
        scale_y: {
            type: 'number'
        },
        x: {
            type: 'number',
            minimum: -2000,
            maximum: 2000
        },
        y: {
            type: 'number',
            minimum: -2000,
            maximum: 2000
        },
        z: {
            type: 'number',
            minimum: 0
        },
        rot: {
            type: 'number'
        }
    },
    required: ['_id', 'x', 'y', 'z', 'scale_x', 'scale_y', 'rot'],
    additionalProperties: true
};

const move_object = {
    type: 'array',
    items: move_objects
}

const delete_row = {
    type: 'object',
    properties: {
        _id: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{24}$'
        }
    },
    required: ['_id'],
    additionalProperties: false
};

const empty = { 
};

module.exports = {
    get_missions: empty,
    get_users: empty,
    insert_chat: insert_chat,
    update_chat: update_chat,
    delete_chat: delete_row,
    get_old_chats: get_old_chats,
    insert_chat_channel: insert_chat_channel,
    insert_user: insert_user,
    update_user: update_user,
    delete_user: delete_row,
    update_user_status: update_user_status,
    insert_mission: insert_mission,
    update_mission: update_mission,
    delete_mission: delete_row,
    insert_mission_user: insert_mission_user,
    update_mission_user: update_mission_user,
    delete_mission_user: delete_row,
    insert_note: insert_note,
    update_note: update_note,
    delete_note: delete_row,
    insert_file: insert_file,
    update_file: update_file,
    delete_file: delete_file,
    insert_event: insert_event,
    update_event: update_event,
    delete_event: delete_row,
    insert_opnote: insert_opnote,
    update_opnote: update_opnote,
    delete_opnote: delete_row,
    insert_object: insert_object,
    paste_object: paste_object,
    change_object: change_object,
    delete_object: delete_row,
    move_object: move_object,
    delete_row: delete_row
}