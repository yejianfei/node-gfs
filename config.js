// Copyright 2015 yejianfei. All rights reserved.
// Use of this source code is governed by a MIT-style
// license that can be found in the LICENSE file.

exports.settings = {
	'mongo':{ //mongodb配置选项;
		'host':'127.0.0.1',
		'port':27017,
		'db':'test',
		'options':{}
	},
	'redis':{ //redis配置选项;
		'host':'localhost',
		'port':6399,
		'max_clients':30/*,
		'options':{
			'auth_pass': 'siyantu' //密码设置（可选）
    		}
    		*/

	},
	'allowBuckets':['images','html'], //允许访问的mongodb collection列表;
	'resize':{ //图像缩放配置，在文件名称与后缀之间添加_<名称>进行所不同尺寸缩放;
		'S':'120x120',
		'M':'640x640',
		'L':'1024x1024'
	},
	'domain':'siyantu.test',//用于iframe回调的跨域配置，针对ajax跨域问题，请配置nginx代理进行解决。
	'tmpTimeout':300, //临时文件有效期，单位秒；
	'tmpdir':'/home/yejianfei/workspace/node/node-gfs/tmp' //临时文件存放路径;
};
