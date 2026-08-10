const zh_CN = {
  popular_fields: '常用字段',
  popular_fields_tip: '你经常加入「显示字段」的字段，以及日志场景常见的时间、正文、级别、链路、容器等字段',
  empty_fields: '空字段',
  empty_fields_tip: '索引里定义了、但当前查询结果中没有取到值的字段。默认折叠，搜索时会自动展开',
  available_fields_no_result_tip: '当前还没有查询结果样本，这里展示的是索引 mapping 里的全部字段。执行查询后会按结果拆分出「空字段」分组',
  popular_fields_no_result_tip: '当前还没有查询结果样本，这里展示的是命中内置推荐词表的候选字段，不代表这个索引真的有值。执行查询后会收敛为本次结果中实际有值的字段',
};

export default zh_CN;
