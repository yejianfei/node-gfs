// Copyright 2015 yejianfei.billy. All rights reserved.
// Use of this source code is governed by a MIT-style
// license that can be found in the LICENSE file.

exports.settings = {
	'mongo':{ //mongodb配置选项;
		'host':'localhost',
		'port':27017,
		'options':{}
	},
	'redis':{ //redis配置选项;
		'options':{}
	},
	'allowBuckets':['images','html'], //允许访问的mongodb collection列表;
	'resize':{ //图像缩放配置，在文件名称与后缀之间添加_<名称>进行所不同尺寸缩放;
		'S':'120x120',
		'M':'640x640',
		'L':'1024x1024'
	},
	'tmpTimeout':600, //临时文件有效期，单位秒；
	'tmpdir':'/home/yejianfei/workspace/javascript/node-gfs/tmp' //临时文件存放路径;
};