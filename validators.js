const insert_chat = {
    type: 'object',
    properties: {
        text: { type: 'string', maxLength: 1024 * 512 },
        channel: { type: 'string', 'enum': [ 'log', 'general' ] },
    },
    required: ['text', 'channel'],
    additionalProperties: true
}

const get_old_chats = {
    type: 'object',
    properties: {
        start_from: { type: 'integer' },
        channel: { type: 'string', 'enum': [ 'log', 'general' ] },
    },
    required: ['start_from', 'channel'],
    additionalProperties: false
}

const insert_user = {
    type: 'object',
    properties: {
        username: { type: 'string', maxLength: 24, pattern: '^[a-zA-Z0-9_\.]{1,24}$' },
        name: { type: 'string', maxLength: 64 },
        password: { type: 'string',  maxLength: 64 },
        permissions: { type: 'object', properties: {
                manage_users: { type: 'boolean' },
                manage_missions: { type: 'boolean' }
            },
            required: ['manage_users', 'manage_missions'],
            additionalProperties: false
        }
    },
    required: ['username', 'name', 'password'],
    additionalProperties: true
}

const update_user = {
    type: 'object',
    properties: {
        name: { type: 'string', maxLength: 64 },
        password: { type: 'string',  maxLength: 64 },
        permissions: { type: 'object', properties: {
                manage_users: { type: 'boolean' },
                manage_missions: { type: 'boolean' }
            },
        required: ['manage_users', 'manage_missions'],
        additionalProperties: false
        }
    },
    additionalProperties: true
}

const delete_user = {
    type: 'object',
    properties: {
        user_id: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' }
    },
    required: ['user_id'],
    additionalProperties: true
}

const insert_mission = {
    type: 'object',
    properties: {
        name: { type: 'string', maxLength: 64 }
    },
    required: ['name'],
    additionalProperties: true
}

const update_mission = {
    type: 'object',
    properties: {
        name: { type: 'string', maxLength: 64 }
    },
    required: ['name'],
    additionalProperties: true
}

const delete_mission = {
    type: 'object',
    properties: {
        mission_id: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' }
    },
    required: ['mission_id'],
    additionalProperties: true
}

const insert_user_mission = {
    type: 'object',
    properties: {
        user_id: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        permissions: { type: 'object', properties: {
                manage_users: { type: 'boolean' },
                modify_diagram: { type: 'boolean' },
                modify_notes: { type: 'boolean' },
                modify_files: { type: 'boolean' },
                api_access: { type: 'boolean' }
            },
            required: ['manage_users', 'modify_diagram', 'modify_notes', 'modify_files', 'api_access'],
            additionalProperties: false
        }
    },
    required: ['user_id', 'permissions'],
    additionalProperties: true
}

const update_user_mission = {
    type: 'object',
    properties: {
        _id: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        permissions: { type: 'object', properties: {
                manage_users: { type: 'boolean' },
                modify_diagram: { type: 'boolean' },
                modify_notes: { type: 'boolean' },
                modify_files: { type: 'boolean' },
                api_access: { type: 'boolean' }
            },
            required: ['manage_users', 'modify_diagram', 'modify_notes', 'modify_files', 'api_access'],
            additionalProperties: false
        }
    },
    required: ['_id', 'permissions'],
    additionalProperties: true
}

const delete_user_mission = {
    type: 'object',
    properties: {
        _id: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' }
    },
    required: ['_id'],
    additionalProperties: true
}


const insert_note = {
    type: 'object',
    properties: {
        name: { type: 'string', maxLength: 64 }
    },
    required: ['name'],
    additionalProperties: true
}

const rename_note = {
    type: 'object',
    properties: {
        id: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        name: { type: 'string', maxLength: 64 },
    },
    required: ['id', 'name'],
    additionalProperties: true
};

const delete_note = {
    type: 'object',
    properties: {
        id: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' }
    },
    required: ['id'],
    additionalProperties: true
};

const insert_event = {
    type: 'object',
    properties: {
        event_time: { type: 'number' },
        discovery_time: { type: 'number' },
        source_object: { type: 'string', pattern: '^$|^[a-fA-F0-9]{24}$' },
        dest_object: { type: 'string', pattern: '^$|^[a-fA-F0-9]{24}$' },
        source_port: { type: 'string', maxLength: 512 },
        dest_port: { type: 'string', maxLength: 512 },
        event_type: { type: 'string', maxLength: 512 },
        short_desc: { type: 'string', maxLength: 1024 * 512 },
    },
    required: ['event_time', 'discovery_time'],
    additionalProperties: true
};

const update_event = {
    type: 'object',
    properties: {
        _id: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        event_time: { type: 'number' },
        discovery_time: { type: 'number' },
        source_object: { type: 'string', pattern: '^$|^[a-fA-F0-9]{24}$' },
        dest_object: { type: 'string', pattern: '^$|^[a-fA-F0-9]{24}$' },
        source_port: { type: 'string', maxLength: 512 },
        dest_port: { type: 'string', maxLength: 512 },
        event_type: { type: 'string', maxLength: 512 },
        short_desc: { type: 'string', maxLength: 1024 * 512 },
    },
    required: ['_id', 'event_time', 'discovery_time'],
    additionalProperties: true
};

const insert_opnote = {
    type: 'object',
    properties: {
        event_id: { type: 'string', pattern: '^$|^[a-fA-F0-9]{24}$' },
        event_time: { type: 'number' },
        source_object: { type: 'string', maxLength: 1024 },
        tool: { type: 'string', maxLength: 1024 },
        action: { type: 'string', maxLength: 1024 * 512 }
    },
    required: ['event_time', 'source_object', 'tool', 'action'],
    additionalProperties: true
};

const update_opnote = {
    type: 'object',
    properties: {
        _id: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        event_id: { type: 'string', pattern: '^$|^[a-fA-F0-9]{24}$' },
        event_time: { type: 'number' },
        source_object: { type: 'string', maxLength: 1024 },
        tool: { type: 'string', maxLength: 1024 },
        action: { type: 'string', maxLength: 1024 * 512 }
    },
    required: ['_id', 'event_time', 'source_object', 'tool', 'action'],
    additionalProperties: true
};

const insert_object = {
    type: 'object',
    properties: {
        type: {
            type: 'string',
            'enum': [ 'link', 'icon', 'shape' ],
            'if': { 'properties' : { 'type': { 'enum': [ 'link' ] } } },
            'then': { 'required' : [ 'obj_a', 'obj_b' ] }
        },
        name: { type: 'string', maxLength: 1024 },
        image: { type: 'string' },
        obj_a: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        obj_b: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        stroke_color: { type: 'string', pattern: '^$|^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$' },
        fill_color: { type: 'string', pattern: '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$' },
        locked: { type: 'boolean' },
        x: { type: 'number', minimum: -2000, maximum: 2000 },
        y: { type: 'number', minimum: -2000, maximum: 2000 },
        z: { type: 'number', minimum: 0 }
    },
    required: ['type', 'name', 'image', 'fill_color', 'locked', 'x', 'y'],
    additionalProperties: true
};

const paste_object = {
    type: 'object',
    properties: {
        _id: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        x: { type: 'number', minimum: -2000, maximum: 2000 },
        y: { type: 'number', minimum: -2000, maximum: 2000 },
        z: { type: 'number', minimum: 0 }
    },
    required: ['_id', 'x', 'y', 'z'],
    additionalProperties: true
};

const change_object = {
    type: 'object',
    properties: {
        _id: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        name: { type: 'string', maxLength: 1024 },
        image: { type: 'string' },
        stroke_color: { type: 'string', pattern: '^$|^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$' },
        fill_color: { type: 'string', pattern: '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$' },
        locked: { type: 'boolean' },
    },
    required: ['name', 'image', 'fill_color', 'locked'],
    additionalProperties: true
};

const move_object = {
    type: 'object',
    properties: {
        _id: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        scale_x: { type: 'number' },
        scale_y: { type: 'number' },
        x: { type: 'number', minimum: -2000, maximum: 2000 },
        y: { type: 'number', minimum: -2000, maximum: 2000 },
        z: { type: 'number', minimum: 0 },
        rot: { type: 'number' }
    },
    required: ['_id', 'x', 'y', 'z', 'scale_x', 'scale_y', 'rot'],
    additionalProperties: true
};

module.exports = {
    insert_chat: insert_chat,
    get_old_chats: get_old_chats,
    insert_user: insert_user,
    update_user: update_user,
    delete_user: delete_user,
    insert_mission: insert_mission,
    update_mission: update_mission,
    delete_mission: delete_mission,
    insert_user_mission: insert_user_mission,
    update_user_mission: update_user_mission,
    delete_user_mission: delete_user_mission,
    insert_note: insert_note,
    rename_note: rename_note,
    delete_note: delete_note,
    insert_event: insert_event,
    update_event: update_event,
    insert_opnote: insert_opnote,
    update_opnote: update_opnote,
    insert_object: insert_object,
    paste_object: paste_object,
    change_object: change_object,
    move_object: move_object
}