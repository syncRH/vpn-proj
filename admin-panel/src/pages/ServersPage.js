import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, CircularProgress, Snackbar, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  FormControl, InputLabel, Select, MenuItem, Modal, FormControlLabel, Switch, Grid, Container, LinearProgress, Tooltip
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, CloudUpload as CloudUploadIcon, Check as CheckIcon } from '@mui/icons-material';
import InfoIcon from '@mui/icons-material/Info';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import axios from 'axios';

const ServersPage = () => {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState('add'); // 'add' или 'edit'
  const [selectedServer, setSelectedServer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    ipAddress: '',
    country: '',
    city: '',
    isActive: true
  });
  const [antizapretFile, setAntizapretFile] = useState(null);
  const [fullVpnFile, setFullVpnFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragOverAntizapret, setDragOverAntizapret] = useState(false);
  const [dragOverFullVpn, setDragOverFullVpn] = useState(false);
  const [antizapretFileName, setAntizapretFileName] = useState('');
  const [fullVpnFileName, setFullVpnFileName] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isFileUploading, setIsFileUploading] = useState(false);
  const [fileValidationErrors, setFileValidationErrors] = useState({
    antizapret: null,
    fullVpn: null
  });

  // Максимальный размер файла в байтах (5 МБ)
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  const fetchServers = async () => {
    try {
      setLoading(true);
      
      const response = await axios.get('/api/servers');
      if (response.data && response.data.servers) {
        setServers(response.data.servers);
      } else {
        setServers([]);
        console.log('Список серверов пуст.');
      }
      
      setError(null);
    } catch (err) {
      console.error('Ошибка загрузки серверов:', err);
      setError('Не удалось загрузить список серверов');
      setServers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, []);

  const handleDialogOpen = (type, server = null) => {
    setDialogType(type);
    if (type === 'edit' && server) {
      setSelectedServer(server);
      setFormData({
        name: server.name || '',
        host: server.host || '',
        ipAddress: server.ipAddress || '',
        country: server.country || '',
        city: server.city || '',
        isActive: server.isActive === true || server.isActive === 'active'
      });
    } else {
      setFormData({
        name: '',
        host: '',
        ipAddress: '',
        country: '',
        city: '',
        isActive: true
      });
      setAntizapretFile(null);
      setFullVpnFile(null);
      setAntizapretFileName('');
      setFullVpnFileName('');
    }
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedServer(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleFileChange = (e) => {
    const { name, files } = e.target;
    if (name === 'antizapretConfig') {
      setAntizapretFile(files[0]);
    } else if (name === 'fullVpnConfig') {
      setFullVpnFile(files[0]);
    }
  };

  const handleDragOverAntizapret = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverAntizapret(true);
  };

  const handleDragLeaveAntizapret = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverAntizapret(false);
  };

  const handleDropAntizapret = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverAntizapret(false);
    
    const files = event.dataTransfer.files;
    if (files.length) {
      const file = files[0];
      if (validateFile(file, 'antizapret')) {
        setAntizapretFile(file);
        setAntizapretFileName(file.name);
      }
    }
  };

  const handleDragOverFullVpn = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverFullVpn(true);
  };

  const handleDragLeaveFullVpn = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverFullVpn(false);
  };

  const handleDropFullVpn = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverFullVpn(false);
    
    const files = event.dataTransfer.files;
    if (files.length) {
      const file = files[0];
      if (validateFile(file, 'fullVpn')) {
        setFullVpnFile(file);
        setFullVpnFileName(file.name);
      }
    }
  };

  const validateFile = (file, type) => {
    const errors = {...fileValidationErrors};
    
    if (!file) {
      errors[type] = null;
      setFileValidationErrors(errors);
      return true;
    }
    
    if (!file.name.endsWith('.ovpn')) {
      errors[type] = 'Файл должен иметь расширение .ovpn';
      setFileValidationErrors(errors);
      return false;
    }
    
    if (file.size > MAX_FILE_SIZE) {
      errors[type] = `Размер файла не должен превышать ${MAX_FILE_SIZE / (1024 * 1024)} МБ`;
      setFileValidationErrors(errors);
      return false;
    }
    
    errors[type] = null;
    setFileValidationErrors(errors);
    return true;
  };

  const handleAntizapretUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (validateFile(file, 'antizapret')) {
        setAntizapretFile(file);
        setAntizapretFileName(file.name);
      } else {
        event.target.value = null;
      }
    }
  };

  const handleFullVpnUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (validateFile(file, 'fullVpn')) {
        setFullVpnFile(file);
        setFullVpnFileName(file.name);
      } else {
        event.target.value = null;
      }
    }
  };

  const handleSubmit = async () => {
    // Проверяем IP адрес
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(formData.ipAddress)) {
      setSnackbar({
        open: true,
        message: 'Некорректный IP адрес. Используйте формат: XXX.XXX.XXX.XXX',
        severity: 'error'
      });
      return;
    }

    // Проверяем наличие файлов
    if (dialogType === 'add' && !antizapretFile) {
      setSnackbar({
        open: true,
        message: 'Необходимо загрузить конфигурацию Anti-zapret VPN',
        severity: 'error'
      });
      return;
    }

    if (dialogType === 'add' && !fullVpnFile) {
      setSnackbar({
        open: true,
        message: 'Необходимо загрузить конфигурацию Full VPN',
        severity: 'error'
      });
      return;
    }

    try {
      setUploading(true);
      setIsFileUploading(true);

      let serverData;
      if (dialogType === 'add') {
        // Добавление сервера
        const formDataToSend = new FormData();
        formDataToSend.append('name', formData.name);
        formDataToSend.append('host', formData.host);
        formDataToSend.append('ipAddress', formData.ipAddress);
        formDataToSend.append('country', formData.country);
        formDataToSend.append('city', formData.city);
        formDataToSend.append('isActive', formData.isActive);
        
        if (antizapretFile) {
          formDataToSend.append('antizapretConfig', antizapretFile);
        }
        
        if (fullVpnFile) {
          formDataToSend.append('fullVpnConfig', fullVpnFile);
        }

        const response = await axios.post('/api/servers', formDataToSend, {
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentCompleted);
          }
        });

        serverData = response.data.server;
        setSnackbar({
          open: true,
          message: 'Сервер успешно добавлен',
          severity: 'success'
        });
      } else {
        // Обновление сервера
        const formDataToSend = new FormData();
        formDataToSend.append('name', formData.name);
        formDataToSend.append('host', formData.host);
        formDataToSend.append('ipAddress', formData.ipAddress);
        formDataToSend.append('country', formData.country);
        formDataToSend.append('city', formData.city);
        formDataToSend.append('isActive', formData.isActive);

        if (antizapretFile) {
          formDataToSend.append('antizapretConfig', antizapretFile);
        }

        if (fullVpnFile) {
          formDataToSend.append('fullVpnConfig', fullVpnFile);
        }

        const response = await axios.put(`/api/servers/${selectedServer._id}`, formDataToSend, {
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentCompleted);
          }
        });

        serverData = response.data.server;
        setSnackbar({
          open: true,
          message: 'Сервер успешно обновлен',
          severity: 'success'
        });
      }

      setDialogOpen(false);
      setFormData({ name: '', host: '', ipAddress: '', country: '', city: '', isActive: true });
      setAntizapretFile(null);
      setFullVpnFile(null);
      setAntizapretFileName('');
      setFullVpnFileName('');
      fetchServers();
    } catch (err) {
      console.error('Ошибка при отправке данных:', err);
      
      let errorMessage = 'Произошла ошибка при обработке запроса.';
      
      if (err.response) {
        const status = err.response.status;
        
        // Обработка различных ошибок сервера
        if (status === 400) {
          errorMessage = 'Неверные данные. Пожалуйста, проверьте введенную информацию.';
        } else if (status === 409) {
          errorMessage = 'Сервер с таким IP уже существует.';
        } else if (status === 413) {
          errorMessage = 'Файл слишком большой. Максимальный размер - 5 МБ.';
        } else if (status === 415) {
          errorMessage = 'Неподдерживаемый тип файла. Пожалуйста, загрузите файл .ovpn';
        } else if (status === 401 || status === 403) {
          errorMessage = 'У вас нет прав для выполнения этого действия.';
        } else if (status >= 500) {
          errorMessage = 'Ошибка сервера. Пожалуйста, попробуйте позже.';
        }
        
        if (err.response.data && err.response.data.message) {
          errorMessage = err.response.data.message;
        }
      }
      
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error'
      });
    } finally {
      setUploading(false);
      setIsFileUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDeleteServer = async (id) => {
    const serverToDelete = servers.find(server => server._id === id);
    try {
      setLoading(true);
      
      // Делаем запрос к API для удаления сервера
      await axios.delete(`/api/servers/${id}`);
      setSnackbar({ 
        open: true, 
        message: `Сервер "${serverToDelete.name}" успешно удален`, 
        severity: 'success' 
      });
      fetchServers();
    } catch (err) {
      console.error('Ошибка при удалении сервера:', err);
      setSnackbar({ 
        open: true, 
        message: `Ошибка при удалении сервера: ${err.message}`, 
        severity: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const columns = [
    { field: '_id', headerName: 'ID', width: 100 },
    { field: 'name', headerName: 'Название', width: 130 },
    { field: 'host', headerName: 'Хост', width: 150 },
    { field: 'ipAddress', headerName: 'IP адрес', width: 120 },
    { field: 'country', headerName: 'Страна', width: 100 },
    { field: 'city', headerName: 'Город', width: 100 },
    { 
      field: 'isActive', 
      headerName: 'Статус', 
      width: 100,
      renderCell: (params) => (
        <Typography
          variant="body2"
          sx={{
            color: params.value === true ? 'success.main' : 'error.main',
            fontWeight: 'bold'
          }}
        >
          {params.value === true ? 'Активен' : 'Отключен'}
        </Typography>
      )
    },
    {
      field: 'createdAt',
      headerName: 'Создан',
      width: 180,
      valueFormatter: (params) => {
        if (!params.value) return '';
        return new Date(params.value).toLocaleString();
      }
    },
    {
      field: 'updatedAt',
      headerName: 'Обновлен',
      width: 180,
      valueFormatter: (params) => {
        if (!params.value) return '';
        return new Date(params.value).toLocaleString();
      }
    },
    {
      field: 'actions',
      headerName: 'Действия',
      width: 180,
      sortable: false,
      renderCell: (params) => (
        <Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<EditIcon />}
            onClick={() => handleDialogOpen('edit', params.row)}
            sx={{ mr: 1 }}
          >
            Изменить
          </Button>
          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<DeleteIcon />}
            onClick={() => handleDeleteServer(params.row._id)}
          >
            Удалить
          </Button>
        </Box>
      )
    }
  ];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Управление серверами</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => handleDialogOpen('add')}
        >
          Добавить сервер
        </Button>
      </Box>

      {loading ? (
        <LinearProgress />
      ) : (
        <Paper sx={{ height: 400, width: '100%' }}>
          <DataGrid
            rows={servers}
            columns={columns}
            pageSize={5}
            rowsPerPageOptions={[5, 10, 20]}
            getRowId={(row) => row._id}
            disableSelectionOnClick
          />
        </Paper>
      )}

      <Dialog open={dialogOpen} onClose={handleDialogClose} maxWidth="md" fullWidth>
        <DialogTitle>
          {dialogType === 'add' ? 'Добавить новый сервер' : 'Редактировать сервер'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              fullWidth
              id="name"
              label="Название сервера"
              name="name"
              value={formData.name || ''}
              onChange={handleInputChange}
              helperText="Автоматически извлекается из .ovpn файла, если не указано"
            />
            
            <TextField
              margin="normal"
              fullWidth
              id="host"
              label="Хост"
              name="host"
              value={formData.host || ''}
              onChange={handleInputChange}
              helperText="Автоматически извлекается из .ovpn файла, если не указано"
            />

            <TextField
              margin="normal"
              required
              fullWidth
              id="ipAddress"
              label="IP адрес сервера"
              name="ipAddress"
              value={formData.ipAddress || ''}
              onChange={handleInputChange}
            />
            
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  margin="normal"
                  fullWidth
                  id="country"
                  label="Страна"
                  name="country"
                  value={formData.country || ''}
                  onChange={handleInputChange}
                  helperText="Автоматически извлекается из .ovpn файла, если не указано"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  margin="normal"
                  fullWidth
                  id="city"
                  label="Город"
                  name="city"
                  value={formData.city || ''}
                  onChange={handleInputChange}
                  helperText="Автоматически извлекается из .ovpn файла, если не указано"
                />
              </Grid>
            </Grid>

            {dialogType === 'edit' && (
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.isActive || false}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    name="isActive"
                  />
                }
                label="Активен"
                sx={{ mt: 2 }}
              />
            )}

            <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>
              Загрузка конфигурационных файлов 
              <Tooltip title="Загрузите файлы в формате .ovpn размером до 5 МБ">
                <InfoIcon fontSize="small" color="action" sx={{ ml: 1, verticalAlign: 'middle' }} />
              </Tooltip>
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Пожалуйста, загрузите файлы конфигурации .ovpn для работы сервера
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                  Anti-zapret VPN конфигурация
                  {antizapretFile && !fileValidationErrors.antizapret && (
                    <CheckCircleIcon color="success" fontSize="small" sx={{ ml: 1 }} />
                  )}
                  {fileValidationErrors.antizapret && (
                    <ErrorIcon color="error" fontSize="small" sx={{ ml: 1 }} />
                  )}
                </Typography>
                <Box 
                  sx={{
                    border: '2px dashed',
                    borderColor: fileValidationErrors.antizapret 
                      ? 'error.main' 
                      : dragOverAntizapret 
                        ? 'primary.main' 
                        : antizapretFile 
                          ? 'success.main' 
                          : 'grey.400',
                    borderRadius: 1,
                    p: 2,
                    mt: 1,
                    mb: 2,
                    bgcolor: fileValidationErrors.antizapret 
                      ? 'rgba(211, 47, 47, 0.04)' 
                      : dragOverAntizapret 
                        ? 'rgba(25, 118, 210, 0.08)' 
                        : antizapretFile 
                          ? 'rgba(46, 125, 50, 0.04)' 
                          : 'transparent',
                    transition: 'all 0.3s',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '140px',
                    cursor: 'pointer'
                  }}
                  onDragOver={handleDragOverAntizapret}
                  onDragLeave={handleDragLeaveAntizapret}
                  onDrop={handleDropAntizapret}
                  onClick={() => document.getElementById('antizapret-upload').click()}
                >
                  <input
                    type="file"
                    id="antizapret-upload"
                    hidden
                    accept=".ovpn"
                    onChange={handleAntizapretUpload}
                  />
                  {antizapretFileName ? (
                    <>
                      <Typography variant="body1" color={fileValidationErrors.antizapret ? "error" : "primary"} sx={{ textAlign: 'center' }}>
                        {antizapretFileName}
                      </Typography>
                      {fileValidationErrors.antizapret && (
                        <Typography variant="caption" color="error" sx={{ mt: 1, textAlign: 'center' }}>
                          {fileValidationErrors.antizapret}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, width: '100%', justifyContent: 'center' }}>
                        <Button 
                          size="small" 
                          color="error" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setAntizapretFile(null);
                            setAntizapretFileName('');
                            setFileValidationErrors({...fileValidationErrors, antizapret: null});
                          }}
                          startIcon={<DeleteIcon />}
                          variant="outlined"
                          sx={{ mr: 1 }}
                        >
                          Удалить
                        </Button>
                        {dialogType === 'edit' && (
                          <Button
                            size="small"
                            color="primary"
                            variant="outlined"
                            startIcon={<UploadFileIcon />}
                          >
                            Заменить
                          </Button>
                        )}
                      </Box>
                      {isFileUploading && (
                        <>
                          <Typography variant="caption" sx={{ mt: 1 }}>
                            Загрузка: {uploadProgress}%
                          </Typography>
                          <LinearProgress 
                            variant="determinate" 
                            value={uploadProgress} 
                            sx={{ width: '100%', mt: 1 }} 
                          />
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <CloudUploadIcon color="primary" sx={{ fontSize: 40, mb: 1 }} />
                      <Typography variant="body1" sx={{ textAlign: 'center' }}>
                        Перетащите файл конфигурации сюда или нажмите для выбора
                      </Typography>
                      <Typography variant="caption" color="textSecondary" sx={{ mt: 1, textAlign: 'center' }}>
                        Только файлы .ovpn (макс. 5 МБ)
                      </Typography>
                    </>
                  )}
                </Box>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                  Full VPN конфигурация
                  {fullVpnFile && !fileValidationErrors.fullVpn && (
                    <CheckCircleIcon color="success" fontSize="small" sx={{ ml: 1 }} />
                  )}
                  {fileValidationErrors.fullVpn && (
                    <ErrorIcon color="error" fontSize="small" sx={{ ml: 1 }} />
                  )}
                </Typography>
                <Box 
                  sx={{
                    border: '2px dashed',
                    borderColor: fileValidationErrors.fullVpn 
                      ? 'error.main' 
                      : dragOverFullVpn 
                        ? 'primary.main' 
                        : fullVpnFile 
                          ? 'success.main' 
                          : 'grey.400',
                    borderRadius: 1,
                    p: 2,
                    mt: 1,
                    mb: 2,
                    bgcolor: fileValidationErrors.fullVpn 
                      ? 'rgba(211, 47, 47, 0.04)' 
                      : dragOverFullVpn 
                        ? 'rgba(25, 118, 210, 0.08)' 
                        : fullVpnFile 
                          ? 'rgba(46, 125, 50, 0.04)' 
                          : 'transparent',
                    transition: 'all 0.3s',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '140px',
                    cursor: 'pointer'
                  }}
                  onDragOver={handleDragOverFullVpn}
                  onDragLeave={handleDragLeaveFullVpn}
                  onDrop={handleDropFullVpn}
                  onClick={() => document.getElementById('fullvpn-upload').click()}
                >
                  <input
                    type="file"
                    id="fullvpn-upload"
                    hidden
                    accept=".ovpn"
                    onChange={handleFullVpnUpload}
                  />
                  {fullVpnFileName ? (
                    <>
                      <Typography variant="body1" color={fileValidationErrors.fullVpn ? "error" : "primary"} sx={{ textAlign: 'center' }}>
                        {fullVpnFileName}
                      </Typography>
                      {fileValidationErrors.fullVpn && (
                        <Typography variant="caption" color="error" sx={{ mt: 1, textAlign: 'center' }}>
                          {fileValidationErrors.fullVpn}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, width: '100%', justifyContent: 'center' }}>
                        <Button 
                          size="small" 
                          color="error" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setFullVpnFile(null);
                            setFullVpnFileName('');
                            setFileValidationErrors({...fileValidationErrors, fullVpn: null});
                          }}
                          startIcon={<DeleteIcon />}
                          variant="outlined"
                          sx={{ mr: 1 }}
                        >
                          Удалить
                        </Button>
                        {dialogType === 'edit' && (
                          <Button
                            size="small"
                            color="primary"
                            variant="outlined"
                            startIcon={<UploadFileIcon />}
                          >
                            Заменить
                          </Button>
                        )}
                      </Box>
                      {isFileUploading && (
                        <>
                          <Typography variant="caption" sx={{ mt: 1 }}>
                            Загрузка: {uploadProgress}%
                          </Typography>
                          <LinearProgress 
                            variant="determinate" 
                            value={uploadProgress} 
                            sx={{ width: '100%', mt: 1 }} 
                          />
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <CloudUploadIcon color="primary" sx={{ fontSize: 40, mb: 1 }} />
                      <Typography variant="body1" sx={{ textAlign: 'center' }}>
                        Перетащите файл конфигурации сюда или нажмите для выбора
                      </Typography>
                      <Typography variant="caption" color="textSecondary" sx={{ mt: 1, textAlign: 'center' }}>
                        Только файлы .ovpn (макс. 5 МБ)
                      </Typography>
                    </>
                  )}
                </Box>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose} disabled={uploading}>
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            color="primary"
            disabled={uploading}
            startIcon={uploading ? <CircularProgress size={20} /> : null}
          >
            {uploading ? 'Загрузка...' : (dialogType === 'add' ? 'Добавить' : 'Обновить')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default ServersPage; 